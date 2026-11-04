-- ================================================================
-- MyDeck — NOTIFICAÇÕES, ETAPA 3: E-MAIL (02/10/2026)
-- Mesma fonte das etapas 1 e 2: cada linha de `notifications` pode virar
-- e-mail, enviado pela Edge Function `notify-dispatch` (via Resend) logo
-- depois do push. O gatilho de despacho (trg_notify_dispatch) não muda.
--
-- Chave da Resend: NÃO fica aqui nem no repositório. Inserir direto no
-- SQL Editor do Supabase (uma vez):
--   insert into app_private_config (key, value) values ('resend_api_key', '<chave>')
--   on conflict (key) do update set value = excluded.value;
-- Sem a chave, a função simplesmente não envia e-mail (push segue normal).
--
-- Idempotente (pode rodar de novo).
-- ================================================================

-- ── 1. PREFERÊNCIA DO USUÁRIO ──────────────────────────────────────
-- Sem linha = ligado (padrão). O usuário só desliga/liga a própria.
create table if not exists notification_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table notification_prefs enable row level security;

drop policy if exists "notification_prefs_select_own" on notification_prefs;
create policy "notification_prefs_select_own" on notification_prefs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notification_prefs_insert_own" on notification_prefs;
create policy "notification_prefs_insert_own" on notification_prefs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "notification_prefs_update_own" on notification_prefs;
create policy "notification_prefs_update_own" on notification_prefs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on notification_prefs from anon, authenticated;
grant select, insert on notification_prefs to authenticated;
grant update (email_enabled, updated_at) on notification_prefs to authenticated;

-- ── 2. REGISTRO DE E-MAILS ENVIADOS ────────────────────────────────
-- Serve a duas coisas: (a) idempotência — a função "reserva" a notificação
-- aqui antes de enviar, então uma chamada repetida (retry do pg_net) nunca
-- manda o mesmo e-mail duas vezes; (b) limite de frequência — "lance
-- coberto" no máximo 1 por leilão a cada 10 min por pessoa.
-- Só a função (service_role) mexe; o client não enxerga.
create table if not exists notification_emails (
  notification_id bigint primary key references notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  auction_id      bigint,
  type            text not null,
  status          text not null default 'pending',  -- pending | sent | skipped | failed
  detail          text,
  created_at      timestamptz not null default now()
);
create index if not exists notification_emails_throttle_idx
  on notification_emails (user_id, auction_id, type, created_at desc);
alter table notification_emails enable row level security;
revoke all on notification_emails from anon, authenticated;

-- ── 3. CONFIGURAÇÃO DE ENVIO (muda sem publicar a função de novo) ──────
insert into app_private_config (key, value)
values ('email_from', 'MyDeck Leilão <leilao@mydecktcg.com.br>')
on conflict (key) do nothing;
-- TRAVA GERAL: começa DESLIGADO ('0'). Com a chave da Resend gravada mas
-- email_live <> '1', a função não envia nada a usuário real nem reserva
-- notificações (só a ação de teste funciona). Ligar depois de ver o e-mail
-- de teste e de o domínio estar verificado na Resend:
--   update app_private_config set value = '1' where key = 'email_live';
-- Desligar a qualquer momento: value = '0'.
insert into app_private_config (key, value)
values ('email_live', '0')
on conflict (key) do nothing;
-- 'email_reply_to' (opcional): endereço que receberá as respostas, p.ex.
--   insert into app_private_config (key, value) values ('email_reply_to', 'voce@exemplo.com')
--   on conflict (key) do update set value = excluded.value;
