-- ================================================================
-- MyDeck — NOTIFICAÇÕES, ETAPA 5: AVISOS EM MASSA COM LIMITE DE PUSH (03/10/2026)
--
-- Avisos que NÓS criamos e vão pra todo mundo passam por uma fila com limite
-- de PUSH, pra não existir "over push". Dois baldes, cada um com seu limite:
--
--   info   novidades do site + notícias (site_update, news)
--          → no máximo 2 pushes a cada 60 min
--   drops  novo leilão + nova rifa (new_auction, new_raffle)
--          → no máximo 2 pushes a cada 24 h
--
-- • O SINO não tem limite: a notificação aparece na hora pra todos. O limite é só do PUSH.
-- • O excedente espera na fila e sai, na ordem de criação, quando abrir vaga
--   (liberação imediata ao criar + conferência a cada 5 min pelo pg_cron).
-- • Janela deslizante (não hora/dia cheio): evita 2 pushes às 10:59 e mais 2 às 11:00.
-- • Quem já leu no sino antes do push sair não recebe push.
-- • Item parado na fila além do prazo é descartado (push velho atrapalha).
-- • "Novo leilão" = 1 aviso por RODADA (na 1ª carta cadastrada; as demais cartas
--   da mesma rodada não geram aviso). Quem cadastrou não é avisado do próprio cadastro.
-- • Avisos de leilão individuais (lance coberto / encerrou) NÃO entram aqui —
--   continuam saindo na hora.
-- • E-mail: nenhum desses tipos gera e-mail (EMAIL_TYPES em dispatch.ts).
-- • Cada pessoa liga/desliga: notification_prefs.news_enabled (novidades e
--   notícias) e notification_prefs.drops_enabled (novos leilões e rifas).
-- • Ajustável sem publicar nada, em app_private_config:
--     push_info_max / push_info_window_min / push_info_expire_hours   (2 / 60 / 12)
--     push_drops_max / push_drops_window_min / push_drops_expire_hours (2 / 1440 / 36)
--
-- Depende das etapas 1-4. Idempotente.
-- ================================================================

-- ── 1. CONFIGURAÇÃO ────────────────────────────────────────────────
insert into app_private_config (key, value) values
  ('push_info_max', '2'),   ('push_info_window_min', '60'),    ('push_info_expire_hours', '12'),
  ('push_drops_max', '2'),  ('push_drops_window_min', '1440'), ('push_drops_expire_hours', '36')
on conflict (key) do nothing;

-- ── 2. PREFERÊNCIA: novos leilões e rifas ──────────────────────────
alter table notification_prefs
  add column if not exists drops_enabled boolean not null default true;
grant update (drops_enabled) on notification_prefs to authenticated;

-- ── 3. FILA ────────────────────────────────────────────────────────
-- Uma linha por "envio em massa" (uma novidade, uma notícia, uma rodada, uma rifa).
create table if not exists push_broadcast_queue (
  batch       text primary key,                 -- 'news:<uuid>' | 'site_update:<id>' | 'new_auction:<round>' | 'new_raffle:<id>'
  type        text not null,
  bucket      text not null default 'info',     -- info | drops
  created_at  timestamptz not null default now(),
  status      text not null default 'pending',  -- pending | sent | skipped | expired
  sent_at     timestamptz,
  notif_count int
);
alter table push_broadcast_queue add column if not exists bucket text not null default 'info';
create index if not exists push_broadcast_queue_status_idx on push_broadcast_queue (status, created_at);
alter table push_broadcast_queue enable row level security;
revoke all on push_broadcast_queue from anon, authenticated;

-- Tipos que passam pela fila (os demais seguem o caminho direto) e o balde de cada um.
create or replace function push_broadcast_types()
returns text[]
language sql
immutable
as $$ select array['site_update', 'news', 'new_auction', 'new_raffle']::text[] $$;

create or replace function push_broadcast_bucket(p_type text)
returns text
language sql
immutable
as $$ select case when p_type in ('new_auction', 'new_raffle') then 'drops' else 'info' end $$;

-- ── 4. GATILHO DE ENVIO DIRETO: deixa de fora os tipos em massa ────
create or replace function notify_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_ids    bigint[];
begin
  begin
    select value into v_secret from app_private_config where key = 'notify_secret';
    select array_agg(id) into v_ids from new_rows where type <> all (push_broadcast_types());

    if v_secret is not null and v_ids is not null then
      perform net.http_post(
        url     := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/notify-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body    := jsonb_build_object('ids', to_jsonb(v_ids))
      );
    end if;
  exception when others then
    raise warning 'notify_dispatch falhou (ignorado, a notificação foi gravada): %', sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function notify_dispatch() from public, anon, authenticated;

-- ── 5. LIBERAÇÃO DA FILA ───────────────────────────────────────────
-- Chamada na hora em que o aviso é criado (se houver vaga, o push sai
-- imediatamente) e a cada 5 min pelo cron (pra soltar o que ficou esperando).
create or replace function release_broadcast_pushes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_bucket text;
  v_max    int;
  v_win    int;
  v_exp    int;
  v_slots  int;
  v_sent   int;
  v_total  int := 0;
  r        record;
  v_ids    bigint[];
begin
  -- uma liberação por vez (dois cadastros simultâneos não furam o limite)
  perform pg_advisory_xact_lock(hashtext('release_broadcast_pushes'));
  select value into v_secret from app_private_config where key = 'notify_secret';

  foreach v_bucket in array array['info', 'drops'] loop
    select coalesce((select value::int from app_private_config where key = 'push_' || v_bucket || '_max'), 2) into v_max;
    select coalesce((select value::int from app_private_config where key = 'push_' || v_bucket || '_window_min'),
                    case when v_bucket = 'drops' then 1440 else 60 end) into v_win;
    select coalesce((select value::int from app_private_config where key = 'push_' || v_bucket || '_expire_hours'),
                    case when v_bucket = 'drops' then 36 else 12 end) into v_exp;

    update push_broadcast_queue set status = 'expired'
     where bucket = v_bucket and status = 'pending' and created_at < now() - make_interval(hours => v_exp);

    select greatest(v_max - count(*), 0) into v_slots
      from push_broadcast_queue
     where bucket = v_bucket and status = 'sent' and sent_at > now() - make_interval(mins => v_win);

    continue when v_slots = 0 or v_secret is null;

    v_sent := 0;
    for r in
      select batch from push_broadcast_queue where bucket = v_bucket and status = 'pending' order by created_at, batch
    loop
      -- só quem ainda não leu no sino
      select array_agg(id) into v_ids from notifications where data ->> 'batch' = r.batch and read_at is null;

      if v_ids is null then
        -- ninguém sobrou pra receber push (todos já leram, ou foram apagadas): não gasta vaga
        update push_broadcast_queue set status = 'skipped', sent_at = now(), notif_count = 0 where batch = r.batch;
        continue;
      end if;

      perform net.http_post(
        url     := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/notify-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body    := jsonb_build_object('ids', to_jsonb(v_ids))
      );
      update push_broadcast_queue set status = 'sent', sent_at = now(), notif_count = array_length(v_ids, 1)
       where batch = r.batch;

      v_sent := v_sent + 1;
      exit when v_sent >= v_slots;
    end loop;
    v_total := v_total + v_sent;
  end loop;

  return v_total;
end;
$$;
revoke all on function release_broadcast_pushes() from public, anon, authenticated;

-- ── 6. GATILHOS: NOVIDADE / NOTÍCIA ────────────────────────────────
create or replace function notify_site_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch text := 'site_update:' || new.id;
begin
  begin
    insert into notifications (user_id, type, title, body, data)
    select u.id, 'site_update', new.title,
           case when length(new.message) > 160 then left(new.message, 157) || '…' else new.message end,
           jsonb_build_object('update_id', new.id, 'url', '/', 'batch', v_batch)
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true);

    insert into push_broadcast_queue (batch, type, bucket) values (v_batch, 'site_update', 'info') on conflict do nothing;
    perform release_broadcast_pushes();
  exception when others then
    raise warning 'notify_site_update: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_site_update() from public, anon, authenticated;

create or replace function notify_pokemon_news()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body  text := coalesce(nullif(btrim(new.subtitle), ''), new.body, '');
  v_batch text := 'news:' || new.id;
begin
  begin
    insert into notifications (user_id, type, title, body, data)
    select u.id, 'news', '📰 ' || new.title,
           case when length(v_body) > 160 then left(v_body, 157) || '…' else v_body end,
           jsonb_build_object('news_id', new.id, 'url', '/', 'batch', v_batch)
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true);

    insert into push_broadcast_queue (batch, type, bucket) values (v_batch, 'news', 'info') on conflict do nothing;
    perform release_broadcast_pushes();
  exception when others then
    raise warning 'notify_pokemon_news: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_pokemon_news() from public, anon, authenticated;

-- ── 7. GATILHOS: NOVO LEILÃO (por rodada) E NOVA RIFA ──────────────
-- Uma rodada recebe várias cartas em sequência (ex.: 7 cartas em 9 minutos):
-- só a 1ª carta gera aviso. O INSERT na fila com ON CONFLICT DO NOTHING é o
-- "já avisei essa rodada?" — atômico, vale mesmo com cadastros simultâneos.
create or replace function notify_new_auction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch  text := 'new_auction:' || new.round_id;
  v_round  text;
  v_when   text;
  v_rows   int;
begin
  if new.status not in ('ativo', 'agendado') then return null; end if;
  begin
    insert into push_broadcast_queue (batch, type, bucket) values (v_batch, 'new_auction', 'drops') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return null; end if;  -- rodada já avisada

    select title into v_round from auction_rounds where id = new.round_id;
    v_when := case
      when new.start_at is not null and new.start_at > now() + interval '5 minutes'
        then 'Começa em ' || to_char(new.start_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
      else 'Já dá pra dar lances'
    end;

    insert into notifications (user_id, type, auction_id, title, body, data)
    select u.id, 'new_auction', new.id,
           '🔨 Novo leilão: ' || coalesce(v_round, 'nova rodada'),
           left(new.card_name || ' e mais · ' || v_when, 160),
           jsonb_build_object('round_id', new.round_id, 'auction_id', new.id, 'url', '/?leilao=' || new.id, 'batch', v_batch)
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.drops_enabled, true)
       and u.id is distinct from new.created_by;

    perform release_broadcast_pushes();
  exception when others then
    raise warning 'notify_new_auction: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_new_auction() from public, anon, authenticated;

drop trigger if exists trg_notify_new_auction on auctions;
create trigger trg_notify_new_auction
  after insert on auctions
  for each row execute function notify_new_auction();

create or replace function notify_new_raffle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch text := 'new_raffle:' || new.id;
  v_rows  int;
  v_body  text;
begin
  if new.status <> 'aberta' then return null; end if;
  begin
    insert into push_broadcast_queue (batch, type, bucket) values (v_batch, 'new_raffle', 'drops') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return null; end if;

    v_body := coalesce(new.ticket_count::text, '?') || ' números · R$ '
              || replace(to_char(coalesce(new.ticket_price, 0), 'FM999999990.00'), '.', ',') || ' cada'
              || case when new.draw_scheduled_at is not null
                      then ' · sorteio ' || to_char(new.draw_scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
                      else '' end;

    insert into notifications (user_id, type, title, body, data)
    select u.id, 'new_raffle', '🎟️ Nova rifa: ' || new.title, left(v_body, 160),
           jsonb_build_object('raffle_id', new.id, 'url', '/?rifa=' || new.id, 'batch', v_batch)
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.drops_enabled, true)
       and u.id is distinct from new.created_by;

    perform release_broadcast_pushes();
  exception when others then
    raise warning 'notify_new_raffle: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_new_raffle() from public, anon, authenticated;

drop trigger if exists trg_notify_new_raffle on raffles;
create trigger trg_notify_new_raffle
  after insert on raffles
  for each row execute function notify_new_raffle();

-- ── 8. CRON: solta a fila a cada 5 minutos ─────────────────────────
do $$
begin
  perform cron.schedule('push-broadcast-release', '*/5 * * * *', $job$select public.release_broadcast_pushes()$job$);
exception when others then
  raise notice 'pg_cron indisponível, fila de push não será liberada sozinha: %', sqlerrm;
end $$;

-- ── Conferência ────────────────────────────────────────────────────
-- select * from push_broadcast_queue order by created_at desc;
-- select * from cron.job where jobname = 'push-broadcast-release';
