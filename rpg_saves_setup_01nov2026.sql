-- Progresso do jogo RPG BD (mydecktcg.com.br/rpg): um registro por usuário.
-- Já aplicado no Supabase em 01/11/2026 (migração rpg_saves_setup).
create table if not exists public.rpg_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rpg_saves enable row level security;

create policy "rpg_saves: ler o próprio" on public.rpg_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "rpg_saves: criar o próprio" on public.rpg_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rpg_saves: atualizar o próprio" on public.rpg_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.rpg_saves to authenticated;
