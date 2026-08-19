-- ================================================================
-- wild_pokemon_setup.sql — Pokémon Escondidos (MyDeck)
-- ================================================================
-- Migra a coleção/pokébolas do wild_pokemon.js de localStorage pra
-- conta real do usuário. Rodar uma vez no SQL Editor do Supabase.
--
-- Sem RPC/anti-cheat por enquanto (igual às tabelas `collection` e
-- `custom_binders`) — isso ainda não vale XP real nem entra em
-- leaderboard público, então escrita direta do client com RLS
-- user_id=auth.uid() é suficiente. Se um dia isso passar a creditar
-- XP de verdade, migrar pra RPC no mesmo padrão do leilão/xp_system
-- (nunca confiar no client quando o dado é público).
-- ================================================================

-- ── Capturas ─────────────────────────────────────────────────────
create table if not exists wild_catches (
  user_id         uuid not null references auth.users(id) on delete cascade,
  pokemon_slug    text not null,
  dex             smallint not null,
  rarity          text not null,
  count           int not null default 1,
  first_caught_at timestamptz not null default now(),
  last_caught_at  timestamptz not null default now(),
  primary key (user_id, pokemon_slug)
);

alter table wild_catches enable row level security;

drop policy if exists "wild_catches_select_own" on wild_catches;
create policy "wild_catches_select_own" on wild_catches
  for select using (user_id = auth.uid());

drop policy if exists "wild_catches_insert_own" on wild_catches;
create policy "wild_catches_insert_own" on wild_catches
  for insert with check (user_id = auth.uid());

drop policy if exists "wild_catches_update_own" on wild_catches;
create policy "wild_catches_update_own" on wild_catches
  for update using (user_id = auth.uid());

-- ── Pokébolas (1 linha por usuário, uma coluna por tier) ────────
create table if not exists wild_balls (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  pokeball    int not null default 5,
  greatball   int not null default 2,
  ultraball   int not null default 1,
  masterball  int not null default 0,
  updated_at  timestamptz not null default now()
);

alter table wild_balls enable row level security;

drop policy if exists "wild_balls_select_own" on wild_balls;
create policy "wild_balls_select_own" on wild_balls
  for select using (user_id = auth.uid());

drop policy if exists "wild_balls_insert_own" on wild_balls;
create policy "wild_balls_insert_own" on wild_balls
  for insert with check (user_id = auth.uid());

drop policy if exists "wild_balls_update_own" on wild_balls;
create policy "wild_balls_update_own" on wild_balls
  for update using (user_id = auth.uid());

-- índice pra listar capturas por raridade rápido (dex já é PK-friendly)
create index if not exists wild_catches_user_rarity_idx on wild_catches (user_id, rarity);
