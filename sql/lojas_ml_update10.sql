-- ================================================================
-- MyDeck — FEEDBACK DE USUÁRIOS · Update 10
-- Mensagem rápida "site em construção, queremos sua opinião" com um
-- botão de enviar — a mensagem chega só pro admin (Eduardo) na aba
-- Dashboard, com opção de responder de volta pro usuário.
-- ================================================================

create table if not exists feedback_messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) default auth.uid(),
  message text not null,
  created_at timestamptz not null default now(),
  reply text,
  replied_at timestamptz,
  ack boolean not null default false -- usuário já viu a resposta e dispensou o aviso
);

alter table feedback_messages enable row level security;

-- Cada usuário só vê/edita as próprias mensagens (pra ver a resposta e marcar "ack")
drop policy if exists "own_feedback_select" on feedback_messages;
create policy "own_feedback_select" on feedback_messages
  for select using (auth.uid() = user_id);

drop policy if exists "own_feedback_insert" on feedback_messages;
create policy "own_feedback_insert" on feedback_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_feedback_update_ack" on feedback_messages;
create policy "own_feedback_update_ack" on feedback_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Funções pro admin ver TODAS as mensagens e responder ──────────
-- (mesmo padrão de admin_dashboard_stats: security definer, checa
-- auth.uid() = UID do Eduardo por dentro, ninguém mais consegue usar)

create or replace function admin_list_feedback()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
  into result
  from (
    select
      fm.id,
      fm.user_id,
      u.email as user_email,
      fm.message,
      fm.created_at,
      fm.reply,
      fm.replied_at
    from feedback_messages fm
    join auth.users u on u.id = fm.user_id
  ) t;

  return result;
end;
$$;

grant execute on function admin_list_feedback() to authenticated;

create or replace function admin_reply_feedback(msg_id bigint, reply_text text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  update feedback_messages
  set reply = reply_text, replied_at = now(), ack = false
  where id = msg_id;
end;
$$;

grant execute on function admin_reply_feedback(bigint, text) to authenticated;
