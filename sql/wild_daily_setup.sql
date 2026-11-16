-- ================================================================
-- wild_daily_setup.sql — Pokémon Escondidos (MyDeck)
-- ================================================================
-- Migra os contadores diários (teto de Poké Ball por uso passivo +
-- bônus de primeiro acesso do dia) de localStorage (por dispositivo)
-- pra uma linha por usuário no Supabase (por conta). Rodar uma vez
-- no SQL Editor do Supabase, depois de já ter rodado
-- wild_pokemon_setup.sql (wild_catches / wild_balls).
--
-- Sem RPC/anti-cheat por enquanto — mesmo padrão das outras tabelas
-- do wild_pokemon (wild_catches, wild_balls): escrita direta do
-- client com RLS user_id=auth.uid(). Se algum dia isso precisar
-- resistir a um usuário adulterando o próprio client (não só
-- sincronizar entre os dispositivos DELE), migrar pra RPC no padrão
-- do leilão/xp_system.
-- ================================================================

create table if not exists wild_daily (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  day                  date not null default current_date,
  passive_balls        int not null default 0,   -- Poké Ball ganhas hoje só por uso passivo do site (teto de 5)
  login_bonus_claimed  boolean not null default false, -- já recebeu a Great Ball de primeiro acesso do dia?
  updated_at           timestamptz not null default now()
);

alter table wild_daily enable row level security;

drop policy if exists "wild_daily_select_own" on wild_daily;
create policy "wild_daily_select_own" on wild_daily
  for select using (user_id = auth.uid());

drop policy if exists "wild_daily_insert_own" on wild_daily;
create policy "wild_daily_insert_own" on wild_daily
  for insert with check (user_id = auth.uid());

drop policy if exists "wild_daily_update_own" on wild_daily;
create policy "wild_daily_update_own" on wild_daily
  for update using (user_id = auth.uid());
