-- ============================================================
-- MyDeck — Compartilhamento público de fichário (link + QR code)
-- Rodar no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- ============================================================

create table if not exists public.binder_shares (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  token      text unique not null default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  set_key    text not null,
  view_mode  text not null default 'grid',   -- 'grid' | 'binder'
  layout     int  not null default 3,        -- 2, 3 ou 4 (só usado no modo binder)
  created_at timestamptz not null default now()
);

alter table public.binder_shares enable row level security;

-- Só o dono pode criar/ver/apagar os próprios links de compartilhamento
drop policy if exists "owner manage shares" on public.binder_shares;
create policy "owner manage shares" on public.binder_shares
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── RPC pública ──────────────────────────────────────────────
-- Roda com privilégio elevado (SECURITY DEFINER) e devolve APENAS
-- o necessário para renderizar o fichário (set, modo, layout e as
-- slot_keys coletadas) — nunca expõe outras tabelas do usuário.
create or replace function public.get_share_collection(p_token text)
returns table(set_key text, view_mode text, layout int, slot_keys text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_set_key   text;
  v_view_mode text;
  v_layout    int;
begin
  select b.user_id, b.set_key, b.view_mode, b.layout
    into v_user_id, v_set_key, v_view_mode, v_layout
  from binder_shares b
  where b.token = p_token
  limit 1;

  if v_user_id is null then
    return; -- token inválido: devolve zero linhas
  end if;

  return query
  select v_set_key, v_view_mode, v_layout,
         coalesce(array_agg(c.slot_key), array[]::text[])
  from collection c
  where c.user_id = v_user_id
    and c.slot_key like v_set_key || ':%';
end;
$$;

grant execute on function public.get_share_collection(text) to anon, authenticated;
