-- ================================================================
-- MyDeck — NOTIFICAÇÕES, ETAPA 2: PUSH (02/10/2026)
-- Aviso no celular/PC mesmo com o app fechado (Web Push / PWA).
--
-- Fluxo: INSERT em `notifications` (etapa 1) → gatilho abaixo avisa a
-- Edge Function `notify-dispatch` via pg_net → a função lê as
-- inscrições do usuário e envia o push (VAPID).
--
-- Pré-requisito: etapa 1 (notificacoes_setup_02out2026.sql) já aplicada
-- e a Edge Function `notify-dispatch` já implantada. Depois de rodar
-- este SQL, chamar a função uma vez com {"action":"init"} (ver rodapé)
-- pra ela gerar o par de chaves VAPID.
-- Idempotente (pode rodar de novo).
-- ================================================================

-- ── 1. CONFIGURAÇÃO ────────────────────────────────────────────────
-- app_private_config: segredos do servidor (segredo compartilhado
-- gatilho→função, chave PRIVADA VAPID). RLS ligada e NENHUMA policy, e
-- zero permissão pra anon/authenticated: só service_role (Edge Function,
-- ignora RLS) e funções security definer enxergam. Nada disso passa pelo
-- navegador nem pelo chat — o segredo é gerado aqui dentro e só circula
-- banco → função.
create table if not exists app_private_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table app_private_config enable row level security;
revoke all on app_private_config from anon, authenticated;

-- app_public_config: o que o navegador precisa ler (chave PÚBLICA VAPID).
create table if not exists app_public_config (
  key   text primary key,
  value text not null
);
alter table app_public_config enable row level security;
drop policy if exists "app_public_config_select" on app_public_config;
create policy "app_public_config_select" on app_public_config
  for select to anon, authenticated using (true);
revoke all on app_public_config from anon, authenticated;
grant select on app_public_config to anon, authenticated;

insert into app_private_config (key, value)
values ('notify_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ── 2. INSCRIÇÕES DE PUSH (uma por aparelho/navegador) ─────────────
-- O client NÃO lê nem escreve direto (guarda chaves de criptografia do
-- aparelho): tudo passa pelas funções abaixo.
create table if not exists push_subscriptions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh_key   text not null,
  auth_key     text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- Aparelho compartilhado: se outra conta entrar no MESMO navegador, o
-- endpoint passa a pertencer a ela (on conflict reatribui user_id) — a
-- conta anterior para de receber os avisos nesse aparelho.
create or replace function register_push_subscription(
  p_endpoint text, p_p256dh_key text, p_auth_key text, p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado.';
  end if;
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh_key,'') = '' or coalesce(p_auth_key,'') = '' then
    raise exception 'Inscrição de push inválida.';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent, last_seen_at)
  values (auth.uid(), p_endpoint, p_p256dh_key, p_auth_key, left(p_user_agent, 300), now())
  on conflict (endpoint) do update set
    user_id      = excluded.user_id,
    p256dh_key   = excluded.p256dh_key,
    auth_key     = excluded.auth_key,
    user_agent   = excluded.user_agent,
    last_seen_at = now();
end;
$$;

create or replace function unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke execute on function register_push_subscription(text,text,text,text) from public, anon;
revoke execute on function unregister_push_subscription(text)             from public, anon;
grant  execute on function register_push_subscription(text,text,text,text) to authenticated;
grant  execute on function unregister_push_subscription(text)             to authenticated;

-- ── 3. GATILHO: nova notificação → Edge Function ───────────────────
-- Nível de COMANDO (não de linha) com tabela de transição: um INSERT que
-- cria N notificações de uma vez (ex.: leilão encerrando avisa todos os
-- perdedores num INSERT...SELECT) vira UMA chamada com N ids.
--
-- NUNCA pode atrapalhar o lance/fechamento: qualquer erro aqui (pg_net
-- fora do ar, segredo ausente, função não implantada) é engolido com um
-- warning — a notificação continua gravada e o app continua mostrando.
-- pg_net enfileira a chamada na própria transação: se ela der rollback,
-- nenhum push sai.
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
    select array_agg(id) into v_ids from new_rows;

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

drop trigger if exists trg_notify_dispatch on notifications;
create trigger trg_notify_dispatch
  after insert on notifications
  referencing new table as new_rows
  for each statement
  execute function notify_dispatch();

-- ── Passos manuais depois de rodar ─────────────────────────────────
-- 1) Gerar as chaves VAPID (uma vez só; o segredo nunca sai do banco):
--    select net.http_post(
--      url     := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/notify-dispatch',
--      headers := jsonb_build_object('Content-Type','application/json',
--                   'x-notify-secret', (select value from app_private_config where key='notify_secret')),
--      body    := '{"action":"init"}'::jsonb);
--    -- conferir: select key from app_public_config;   -- deve listar vapid_public_key
-- 2) Ver o resultado das últimas chamadas à função:
--    select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 10;
