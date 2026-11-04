-- ============================================================
-- MyDeck — Lorcana Alpha — Setup do Banco Supabase
-- Rodar no Supabase: app.supabase.com → SQL Editor → New Query
-- Tabelas 100% novas e separadas das tabelas de Pokémon
-- (purchases, pulled_cards, collection continuam intactas).
-- ============================================================

-- 1. COMPRAS (Lorcana)
create table if not exists lorcana_purchases (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  date date not null,
  product text not null,
  tipo text not null,
  boost int not null default 0,
  cards int not null default 0,
  price numeric(10,2) not null,
  acessorio boolean default false,
  user_id uuid not null
);

-- 2. CARTAS TIRADAS (Lorcana)
create table if not exists lorcana_pulled_cards (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  num text,
  rar text,
  src text,
  lote text,
  icon text,
  ic text,
  bc text,
  price numeric(10,2),
  pmin numeric(10,2),
  pmax numeric(10,2),
  psrc text,
  user_id uuid not null
);

-- 3. COLEÇÃO (slots do master set marcados) — Lorcana
-- slot_key no formato "set1:103:normal" (set : collector_number : versão)
create table if not exists lorcana_collection (
  id bigint generated always as identity primary key,
  slot_key text not null,
  marked_at timestamptz default now(),
  user_id uuid not null,
  constraint lorcana_collection_user_slot_unique unique (user_id, slot_key)
);

-- 4. Índices para busca rápida
create index if not exists idx_lorcana_collection_slot on lorcana_collection(slot_key);
create index if not exists lorcana_purchases_user_idx on lorcana_purchases(user_id);
create index if not exists lorcana_pulled_cards_user_idx on lorcana_pulled_cards(user_id);

-- 5. RLS — cada usuário só vê/edita os próprios dados (mesmo padrão do Pokémon)
alter table lorcana_purchases    enable row level security;
alter table lorcana_pulled_cards enable row level security;
alter table lorcana_collection   enable row level security;

drop policy if exists "own_lorcana_purchases"    on lorcana_purchases;
drop policy if exists "own_lorcana_pulled_cards" on lorcana_pulled_cards;
drop policy if exists "own_lorcana_collection"   on lorcana_collection;

create policy "own_lorcana_purchases" on lorcana_purchases for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_lorcana_pulled_cards" on lorcana_pulled_cards for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_lorcana_collection" on lorcana_collection for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================================================================
-- Nenhuma tabela existente (purchases, pulled_cards, collection,
-- custom_binders) é alterada por este script.
-- ================================================================
