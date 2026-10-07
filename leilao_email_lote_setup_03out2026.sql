-- ================================================================
-- MyDeck — LEILÃO: E-MAIL DE "NOVO LOTE DISPONÍVEL" (03/10/2026)
--
-- Quando uma rodada de leilão recebe a 1ª carta, todo usuário com e-mail
-- confirmado entra numa fila de e-mail (1 e-mail por rodada, listando as
-- cartas — o conteúdo é montado só na hora do envio, 15 min depois, pra já
-- incluir as cartas cadastradas em sequência).
--
-- • LIMITE DE ENVIO: o plano gratuito da Resend aceita ~100 e-mails/dia no
--   total. Reservamos parte pros avisos individuais (lance coberto etc.), então
--   o e-mail em massa usa só o que sobra (cap 100 − reserva 20 − já enviados
--   nas últimas 24 h). O resto da fila sai nos dias seguintes (a cada 10 min o
--   cron tenta de novo). Com plano pago, é só subir `email_daily_cap`.
-- • No máximo 2 e-mails de novo lote por pessoa a cada 24 h.
-- • Fila expira: rodada já encerrada, ou parada há mais de 3 dias.
-- • DESCADASTRO: cada e-mail leva um link pessoal (token) que abre uma página
--   do MyDeck SEM login ("?emails=sair&t=<token>") e desliga os e-mails de
--   novos leilões (ou todos os e-mails do MyDeck), com opção de desfazer.
-- • Preferências: notification_prefs.lots_email_enabled (novos leilões por
--   e-mail) — também no painel do sino. email_enabled=false (desligou todos)
--   também impede.
-- • Só envia com email_live = '1' (a mesma trava geral dos outros e-mails).
-- • Ajustável sem publicar nada, em app_private_config:
--     email_daily_cap (100) · lot_email_reserve (20) · lot_email_per_user_day (2)
--     lot_email_delay_min (15)
--
-- Depende das etapas 1-5. Idempotente.
-- ================================================================

-- ── 1. CONFIGURAÇÃO + PREFERÊNCIA ──────────────────────────────────
insert into app_private_config (key, value) values
  ('email_daily_cap', '100'),
  ('lot_email_reserve', '20'),
  ('lot_email_per_user_day', '2'),
  ('lot_email_delay_min', '15')
on conflict (key) do nothing;

alter table notification_prefs
  add column if not exists lots_email_enabled boolean not null default true;
grant update (lots_email_enabled) on notification_prefs to authenticated;

-- ── 2. TOKENS DE DESCADASTRO (1 por usuário; só o servidor lê) ─────
create table if not exists email_unsub_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table email_unsub_tokens enable row level security;
revoke all on email_unsub_tokens from anon, authenticated;
insert into email_unsub_tokens (user_id) select id from auth.users on conflict do nothing;

-- ── 3. FILA DE E-MAIL (1 linha por rodada × destinatário) ──────────
create table if not exists lot_emails (
  id         bigint generated always as identity primary key,
  batch      text not null,                      -- 'new_auction:<round_id>'
  round_id   bigint not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending',    -- pending | sending | sent | failed | skipped | expired
  attempts   int not null default 0,
  detail     text,
  send_after timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  unique (batch, user_id)
);
create index if not exists lot_emails_status_idx on lot_emails (status, send_after);
alter table lot_emails enable row level security;
revoke all on lot_emails from anon, authenticated;

-- ── 4. GATILHO DO NOVO LEILÃO: agora também enfileira o e-mail ─────
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
  v_delay  int;
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
    raise warning 'notify_new_auction (sino/push): %', sqlerrm;
  end;

  -- e-mail: bloco separado — falha aqui não pode apagar o sino/push de cima
  begin
    select coalesce((select value::int from app_private_config where key = 'lot_email_delay_min'), 15) into v_delay;
    insert into lot_emails (batch, round_id, user_id, send_after)
    select v_batch, new.round_id, u.id, now() + make_interval(mins => v_delay)
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where u.email is not null and u.email_confirmed_at is not null
       and coalesce(p.lots_email_enabled, true)
       and coalesce(p.email_enabled, true)
       and u.id is distinct from new.created_by
    on conflict (batch, user_id) do nothing;
  exception when others then
    raise warning 'notify_new_auction (e-mail): %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_new_auction() from public, anon, authenticated;

-- ── 5. RESERVA DO LOTE DE ENVIO (chamada pela Edge Function) ───────
-- Decide QUANTOS e QUEM pode receber agora (orçamento diário, limite por
-- pessoa, só quem ainda quer receber) e já marca como 'sending'. Devolve o
-- e-mail e o token de descadastro de cada um — o e-mail nunca vai pro client.
create or replace function claim_lot_emails()
returns table (id bigint, batch text, round_id bigint, user_id uuid, email text, token uuid, attempts int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_live     text;
  v_cap      int;
  v_reserve  int;
  v_per_user int;
  v_used     int;
  v_budget   int;
begin
  perform pg_advisory_xact_lock(hashtext('claim_lot_emails'));

  select value into v_live from app_private_config where key = 'email_live';
  if coalesce(v_live, '0') <> '1' then return; end if;

  select coalesce((select value::int from app_private_config where key = 'email_daily_cap'), 100) into v_cap;
  select coalesce((select value::int from app_private_config where key = 'lot_email_reserve'), 20) into v_reserve;
  select coalesce((select value::int from app_private_config where key = 'lot_email_per_user_day'), 2) into v_per_user;

  -- expira o que não faz mais sentido
  update lot_emails l set status = 'expired', detail = 'rodada encerrada ou fila antiga'
   where l.status = 'pending'
     and (l.created_at < now() - interval '3 days'
          or not exists (select 1 from auctions a where a.round_id = l.round_id and a.status in ('ativo', 'agendado')));

  -- orçamento: tudo que saiu (ou está saindo) de e-mail nas últimas 24 h, de qualquer tipo
  select (select count(*) from lot_emails where status in ('sent', 'sending') and sent_at > now() - interval '24 hours')
       + (select count(*) from notification_emails where status in ('sent', 'pending') and created_at > now() - interval '24 hours')
    into v_used;
  v_budget := least(greatest(v_cap - v_reserve - v_used, 0), 100);
  if v_budget = 0 then return; end if;

  -- usuários novos ainda sem token
  insert into email_unsub_tokens (user_id)
  select distinct l.user_id from lot_emails l where l.status = 'pending' on conflict do nothing;

  return query
  with ranked as (
    select l.id,
           row_number() over (partition by l.user_id order by l.created_at, l.id) as rn,
           (select count(*) from lot_emails x
             where x.user_id = l.user_id and x.status in ('sent', 'sending')
               and x.sent_at > now() - interval '24 hours') as ja_recebeu
      from lot_emails l
      join auth.users u on u.id = l.user_id
      left join notification_prefs p on p.user_id = l.user_id
     where l.status = 'pending' and l.send_after <= now() and l.attempts < 3
       and u.email is not null and u.email_confirmed_at is not null
       and coalesce(p.lots_email_enabled, true) and coalesce(p.email_enabled, true)
  ),
  pick as (
    select r.id from ranked r
     where r.rn + r.ja_recebeu <= v_per_user
     order by r.id
     limit v_budget
  )
  , upd as (
    update lot_emails l set status = 'sending', attempts = l.attempts + 1, sent_at = now()
      from pick where l.id = pick.id
    returning l.id, l.batch, l.round_id, l.user_id, l.attempts
  )
  select upd.id, upd.batch, upd.round_id, upd.user_id, u.email::text, t.token, upd.attempts
    from upd
    join auth.users u on u.id = upd.user_id
    join email_unsub_tokens t on t.user_id = upd.user_id
   order by upd.id;
end;
$$;
revoke all on function claim_lot_emails() from public, anon, authenticated;

-- Resultado do envio. 'retry' devolve pra fila (até 3 tentativas) e NÃO gasta orçamento.
create or replace function finish_lot_emails(p_ids bigint[], p_status text, p_detail text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update lot_emails set
    status = case when p_status = 'retry' then (case when attempts >= 3 then 'failed' else 'pending' end) else p_status end,
    detail = left(p_detail, 200),
    sent_at = case when p_status = 'sent' then now() else null end
  where id = any(p_ids) and status = 'sending';
$$;
revoke all on function finish_lot_emails(bigint[], text, text) from public, anon, authenticated;

-- Conteúdo do e-mail de uma rodada, lido na hora do envio: as 5 cartas MAIS CARAS
-- (maior entre lance inicial e preço de "compre já") viram os destaques com foto;
-- o resto só entra na contagem ("+ N outras cartas").
create or replace function lot_email_round(p_round_id bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when r.id is null or n.total = 0 then null else jsonb_build_object(
    'title', r.title,
    'end_at', r.end_at,
    'total', n.total,
    'first_auction_id', n.first_id,
    'first_start_at', n.first_start,
    'cards', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'name', c.card_name, 'price', c.starting_price,
                'buy_now', c.buy_now_price, 'version', c.version, 'condition', c.condition,
                'image', coalesce(c.photo_urls[1], c.image_url)) order by c.valor desc, c.id), '[]'::jsonb)
                from (select a.*, greatest(coalesce(a.starting_price, 0), coalesce(a.buy_now_price, 0)) as valor
                        from auctions a
                       where a.round_id = p_round_id and a.status in ('ativo', 'agendado')
                       order by greatest(coalesce(a.starting_price, 0), coalesce(a.buy_now_price, 0)) desc, a.id
                       limit 5) c)
  ) end
  from (select 1) d
  left join auction_rounds r on r.id = p_round_id
  left join lateral (select count(*) as total, min(a.id) as first_id, min(a.start_at) as first_start
                       from auctions a where a.round_id = p_round_id and a.status in ('ativo', 'agendado')) n on true;
$$;
revoke all on function lot_email_round(bigint) from public, anon, authenticated;

-- ── 6. DESCADASTRO PÚBLICO (por token, sem login) ──────────────────
create or replace function email_unsub_mask(p_email text)
returns text
language sql
immutable
as $$
  select case when p_email is null or position('@' in p_email) < 2 then '' else
    left(split_part(p_email, '@', 1), 1) || '***' || right(split_part(p_email, '@', 1), 1) || '@' || split_part(p_email, '@', 2)
  end
$$;

create or replace function email_unsub_info(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select u.email, t.user_id, coalesce(p.lots_email_enabled, true) as lots, coalesce(p.email_enabled, true) as allm
    into r
    from email_unsub_tokens t
    join auth.users u on u.id = t.user_id
    left join notification_prefs p on p.user_id = t.user_id
   where t.token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'email', email_unsub_mask(r.email),
                            'lots_email_enabled', r.lots, 'email_enabled', r.allm);
end;
$$;

-- p_scope: 'lots' (só novos leilões) | 'all' (todos os e-mails do MyDeck) | 'undo' (volta tudo)
create or replace function email_unsub_apply(p_token uuid, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from email_unsub_tokens where token = p_token;
  if v_user is null then return jsonb_build_object('ok', false); end if;
  if p_scope not in ('lots', 'all', 'undo') then return jsonb_build_object('ok', false); end if;

  insert into notification_prefs (user_id, lots_email_enabled, email_enabled, updated_at)
  values (v_user,
          p_scope = 'undo',
          p_scope <> 'all',
          now())
  on conflict (user_id) do update set
    lots_email_enabled = excluded.lots_email_enabled,
    email_enabled = case when p_scope = 'lots' then notification_prefs.email_enabled else excluded.email_enabled end,
    updated_at = now();

  -- tira da fila o que ainda não saiu
  if p_scope <> 'undo' then
    update lot_emails set status = 'skipped', detail = 'descadastro', sent_at = null
     where user_id = v_user and status = 'pending';
  end if;

  return email_unsub_info(p_token);
end;
$$;

revoke all on function email_unsub_info(uuid), email_unsub_apply(uuid, text) from public;
grant execute on function email_unsub_info(uuid), email_unsub_apply(uuid, text) to anon, authenticated;

-- ── 7. CRON: a cada 10 min, se tem e-mail vencido na fila, chama a função ──
create or replace function kick_lot_emails()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_secret text;
begin
  if not exists (select 1 from lot_emails where status = 'pending' and send_after <= now() and attempts < 3) then
    return;
  end if;
  select value into v_secret from app_private_config where key = 'notify_secret';
  if v_secret is null then return; end if;
  perform net.http_post(
    url     := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := jsonb_build_object('action', 'send_lot_emails')
  );
end;
$$;
revoke all on function kick_lot_emails() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('lot-emails-send', '*/10 * * * *', $job$select public.kick_lot_emails()$job$);
exception when others then
  raise notice 'pg_cron indisponível, e-mails de novo lote não serão enviados sozinhos: %', sqlerrm;
end $$;

-- ── Conferência ────────────────────────────────────────────────────
-- select status, count(*) from lot_emails group by 1;
-- select * from cron.job where jobname = 'lot-emails-send';

