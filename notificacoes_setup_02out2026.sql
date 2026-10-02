-- ================================================================
-- MyDeck — NOTIFICAÇÕES (02/10/2026)
-- Etapa 1 (no app): tabela de notificações + gatilhos do leilão.
--
-- Primeiros avisos: "seu lance foi coberto" e "leilão encerrou".
-- A tabela é genérica (type + title + body + data) pra receber os
-- próximos tipos sem migração — "encerra em 1h", "você ganhou",
-- cancelamento etc. — e pra servir de fonte única dos outros canais
-- (push e e-mail, etapas seguintes leem as mesmas linhas).
--
-- POR QUE GATILHO E NÃO MEXER NO place_bid():
-- o repositório tem DUAS versões divergentes de place_bid()/close_round()
-- (xp_events_migration_23ago2026.sql com XP; leilao_preco_arremate_
-- migration_01set2026.sql sem XP, com arremate imediato). Conferido no
-- banco em 02/10/2026: a ATIVA é a de 01/09 (sem XP — o XP do leilão
-- está desligado desde 01/09). Gatilhos em `auctions` olham só o que
-- mudou na linha (current_bidder / status), não o código que mudou —
-- então continuam valendo quando o XP for restaurado numa mescla futura.
--
-- APLICADA em produção em 02/10/2026 (migration "notificacoes_leilao_
-- etapa1") e testada com place_bid()/close_round() reais dentro de uma
-- transação desfeita: coberto, arremate imediato (sem aviso duplicado) e
-- fim de prazo. Idempotente (pode rodar de novo).
-- Depende de: auctions, auction_bids, auction_min_increment()
-- (leilao_setup.sql).
-- ================================================================

-- ── 1. TABELA ──────────────────────────────────────────────────────
create table if not exists notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,   -- 'auction_outbid' | 'auction_closed' | (futuros, sem CHECK de propósito)
  auction_id  bigint references auctions(id) on delete cascade,
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,   -- {auction_id, current_bid, min_next_bid, end_at, url}
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on notifications (user_id) where read_at is null;

-- ── 2. RLS — cada um só enxerga/mexe nas próprias ──────────────────
-- Ninguém insere pelo client: só os gatilhos abaixo (security definer).
-- O client só pode LER, marcar como lida (única coluna atualizável) e
-- apagar as suas.
alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_delete_own" on notifications
  for delete to authenticated using (user_id = auth.uid());

revoke all on notifications from anon, authenticated;
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

-- ── 3. GATILHO: lance coberto ──────────────────────────────────────
-- Dispara quando o líder do leilão muda de UMA pessoa pra OUTRA. O
-- texto NÃO diz quem cobriu (hoje o lance só é visível pro próprio autor
-- e pro leiloeiro, e o log público mostra só iniciais) — só o novo valor
-- e o mínimo pra recobrir.
--
-- Arremate imediato: se este lance bateu o preço de arremate, o leilão
-- vai ser fechado na MESMA transação (close_auction_as_sold) e quem foi
-- coberto recebe "leilão encerrou" (gatilho da seção 4) em vez de um
-- "cubra o lance" que já não faz sentido — por isso sai sem aviso aqui.
create or replace function notify_auction_outbid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_next numeric;
begin
  if old.current_bidder is null or new.current_bidder is null
     or old.current_bidder = new.current_bidder then
    return new;
  end if;

  if new.buy_now_price is not null and new.current_bid >= new.buy_now_price then
    return new;
  end if;

  v_min_next := new.current_bid + auction_min_increment(new.current_bid);

  insert into notifications (user_id, type, auction_id, title, body, data)
  values (
    old.current_bidder,
    'auction_outbid',
    new.id,
    'Seu lance foi coberto',
    format(
      '%s: novo lance de R$ %s. Para recobrir, o mínimo agora é R$ %s. Encerra em %s.',
      new.card_name,
      replace(to_char(new.current_bid, 'FM999999990.00'), '.', ','),
      replace(to_char(v_min_next,      'FM999999990.00'), '.', ','),
      to_char(new.end_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
    ),
    jsonb_build_object(
      'auction_id',   new.id,
      'current_bid',  new.current_bid,
      'min_next_bid', v_min_next,
      'end_at',       new.end_at,
      'url',          '/?leilao=' || new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_auction_outbid on auctions;
create trigger trg_notify_auction_outbid
  after update of current_bidder on auctions
  for each row
  when (old.current_bidder is distinct from new.current_bidder)
  execute function notify_auction_outbid();

-- ── 4. GATILHO: leilão encerrou ────────────────────────────────────
-- Avisa todo mundo que deu lance e NÃO ganhou (inclui quem foi coberto
-- pelo lance de arremate). Quem ganhou fica pra "você ganhou", que entra
-- numa etapa seguinte. close_auction_as_sold()/close_round() gravam
-- status e winner_id no MESMO update, então new.winner_id já vem certo.
create or replace function notify_auction_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, type, auction_id, title, body, data)
  select distinct
    b.bidder_id,
    'auction_closed',
    new.id,
    'Leilão encerrado',
    format('O leilão de %s encerrou e o seu lance não foi o vencedor.', new.card_name),
    jsonb_build_object('auction_id', new.id, 'url', '/?leilao=' || new.id)
  from auction_bids b
  where b.auction_id = new.id
    and b.bidder_id is distinct from new.winner_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_auction_closed on auctions;
create trigger trg_notify_auction_closed
  after update of status on auctions
  for each row
  when (old.status = 'ativo' and new.status = 'encerrado')
  execute function notify_auction_closed();

-- Funções de gatilho não devem ser chamáveis por RPC público (mesma
-- regra do 02/09/2026 pro close_auction_as_sold).
revoke execute on function notify_auction_outbid() from public, anon, authenticated;
revoke execute on function notify_auction_closed() from public, anon, authenticated;

-- ── 5. REALTIME — o app escuta INSERT filtrando por user_id ────────
-- (respeita a RLS acima: cada um só recebe as próprias).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- ── 6. LIMPEZA — apaga avisos com mais de 60 dias, 1x por semana ───
-- (domingo 04:00 UTC). pg_cron já está habilitado no projeto
-- (lojas_ml_update7.sql). Se por algum motivo não estiver, só avisa e
-- segue — a limpeza é conveniência, não requisito.
do $$
begin
  perform cron.schedule(
    'notifications-cleanup',
    '0 4 * * 0',
    $job$delete from public.notifications where created_at < now() - interval '60 days'$job$
  );
exception when others then
  raise notice 'pg_cron indisponível, limpeza semanal não agendada: %', sqlerrm;
end $$;

-- ── Conferência (rodar depois) ─────────────────────────────────────
-- select tgname, tgenabled from pg_trigger where tgname like 'trg_notify_auction%';
-- select * from notifications order by created_at desc limit 20;
-- select * from cron.job where jobname = 'notifications-cleanup';
