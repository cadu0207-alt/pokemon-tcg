-- ============================================================
-- Pokémon TCG Dashboard — Setup do Banco Supabase
-- Execute no SQL Editor do Supabase (menu esquerdo > SQL Editor)
-- ============================================================

-- 1. COMPRAS
create table if not exists purchases (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  date date not null,
  product text not null,
  tipo text not null,
  boost int not null default 0,
  cards int not null default 0,
  price numeric(10,2) not null,
  acessorio boolean default false
);

-- 2. CARTAS TIRADAS
create table if not exists pulled_cards (
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
  psrc text
);

-- 3. COLEÇÃO (slots do master set marcados)
create table if not exists collection (
  id bigint generated always as identity primary key,
  slot_key text unique not null,  -- ex: "me04:015:F"
  marked_at timestamptz default now()
);

-- 4. Índice para busca rápida de slot
create index if not exists idx_collection_slot on collection(slot_key);

-- 5. Habilitar RLS (Row Level Security) — acesso público por enquanto
alter table purchases enable row level security;
alter table pulled_cards enable row level security;
alter table collection enable row level security;

-- 6. Políticas de acesso público (sem autenticação por enquanto)
create policy "public read purchases" on purchases for select using (true);
create policy "public insert purchases" on purchases for insert with check (true);
create policy "public delete purchases" on purchases for delete using (true);

create policy "public read pulled" on pulled_cards for select using (true);
create policy "public insert pulled" on pulled_cards for insert with check (true);
create policy "public delete pulled" on pulled_cards for delete using (true);

create policy "public read collection" on collection for select using (true);
create policy "public insert collection" on collection for insert with check (true);
create policy "public delete collection" on collection for delete using (true);

-- 7. Inserir compras iniciais
insert into purchases (date, product, tipo, boost, cards, price, acessorio) values
  ('2026-06-14', 'Blister Triplo ME04 Caos Ascendente — Charmeleon Promo', 'Blister Triplo', 3, 18, 42.99, false),
  ('2026-06-14', 'Blister Quádruplo ME04 Caos Ascendente — Toxel Promo', 'Blister Quádruplo', 4, 24, 37.69, false),
  ('2026-06-15', 'Blister Triplo Megaevolução 1 — Drifloon Promo (CoffeeCat)', 'Blister Triplo', 3, 18, 35.46, false),
  ('2026-06-15', 'Mini Álbum 60 Cartas + Pacote Phantom (CoffeeCat)', 'Mini Álbum + Booster', 1, 10, 48.55, false),
  ('2026-06-15', 'Blister Triplo Caos Ascendente PT-BR (CoffeeCat)', 'Blister Triplo', 3, 18, 36.59, false),
  ('2026-06-17', 'Patch 4 Boosters ME04 Caos Ascendente', 'Combo de Boosters', 4, 24, 31.00, false),
  ('2026-06-23', 'Coleção Parceiros Iniciais Série 1 (Kanto + 2×MEG + 1×ME02)', 'Coleção Treinador Avançado', 3, 30, 109.90, false),
  ('2026-06-23', 'Caderno de Cartas (Acessório)', 'Outro', 0, 0, 43.99, true);

-- 8. Inserir cartas tiradas iniciais
insert into pulled_cards (name, num, rar, src, lote, icon, ic, bc, price, pmin, pmax, psrc) values
  ('Charmeleon', '079 — Promo Holo', 'Promocional', 'Blister Triplo ME04', 'Lote 1 — ME04 Caos Ascendente', '🔥', 'fi', 'bp', 8.00, 6.00, 12.00, 'Estimado'),
  ('Toxel', 'Promo — Blister Quádruplo', 'Promocional', 'Blister Quádruplo ME04', 'Lote 1 — ME04 Caos Ascendente', '⚡', 'fp', 'bp', 9.00, 7.00, 14.00, 'Estimado'),
  ('Mega Pyroar ex', '015/086', 'Dupla Rara (RR)', 'Booster ME04', 'Lote 1 — ME04 Caos Ascendente', '🦁', 'fi', 'br', 6.55, 3.50, 24.99, 'Liga Pokémon jun/2026'),
  ('Mega Dragalge ex', '065/086', 'Dupla Rara (RR)', 'Booster ME04', 'Lote 1 — ME04 Caos Ascendente', '🐉', 'fd', 'br', 6.99, 5.90, 12.00, 'Deck Certo jun/2026'),
  ('Tauros', '096/086', 'Ilustração Rara (SAR)', 'Booster ME04', 'Lote 1 — ME04 Caos Ascendente', '🐂', 'fs', 'bi', 40.00, 30.00, 59.99, 'Deck Certo jun/2026'),
  ('Toxtricity', '068/094 — Holo', 'Rara (Holo)', 'Mini Álbum + Booster Phantom', 'Lote 2 — CoffeeCat (ME02)', '⚡', 'fp', 'bx', 5.50, 3.00, 9.00, 'TCGPlayer jun/2026'),
  ('Wondrous Patch', '094/094 — Holo', 'Incomum (Holo)', 'Mini Álbum + Booster Phantom', 'Lote 2 — CoffeeCat (ME02)', '🔮', 'fp', 'bx', 1.50, 0.80, 3.00, 'Estimado jun/2026'),
  ('Wondrous Patch', '094/094 — Reverse Holo', 'Incomum (RH)', 'Mini Álbum + Booster Phantom', 'Lote 2 — CoffeeCat (ME02)', '🔮', 'fp', 'bx', 2.00, 1.00, 4.00, 'Estimado jun/2026'),
  ('Gligar', '049/094 — Reverse Holo', 'Comum (RH)', 'Mini Álbum + Booster Phantom', 'Lote 2 — CoffeeCat (ME02)', '🦂', 'fp', 'bx', 0.80, 0.40, 1.50, 'Estimado'),
  ('Charmeleon', '079 — Promo Holo (2ª cópia)', 'Promocional', 'Blister Triplo ME04 PT-BR', 'Lote 2 — CoffeeCat (ME04)', '🔥', 'fi', 'bp', 8.00, 6.00, 12.00, 'Estimado'),
  ('Drifloon', '005/∞ — Promo Holo', 'Promocional', 'Blister Triplo Megaevolução 1', 'Lote 2 — CoffeeCat (ME01)', '🎈', 'fp', 'bp', 1.03, 0.45, 4.49, 'Liga Pokémon jun/2026'),
  ('Ferrothorn', '063/086 — Reverse Holo', 'Incomum (RH)', 'Blister Triplo ME04 PT-BR', 'Lote 2 — CoffeeCat (ME04)', '⚙️', 'fp', 'bx', 0.48, null, null, 'Deck Certo jun/2026'),
  ('Gholdengo', '099/132 — Reverse Holo', 'Incomum (RH)', 'Blister Triplo Megaevolução 1', 'Lote 2 — CoffeeCat (MEG)', '🪙', 'fs', 'bx', 6.20, 4.00, 9.00, 'Sports Card Investor jun/2026'),
  ('Ninetales', '020/132 — Reverse Holo', 'Incomum (RH)', 'Blister Triplo Megaevolução 1', 'Lote 2 — CoffeeCat (MEG)', '🦊', 'fi', 'bx', 0.70, 0.40, 1.50, 'Estimado'),
  ('Hariyama', '073/132 — Holo', 'Rara (Holo)', 'Blister Triplo Megaevolução 1', 'Lote 2 — CoffeeCat (MEG)', '🥊', 'fp', 'bx', 1.00, 0.60, 2.50, 'Estimado'),
  ('Mega Venusaur ex', '003/132 — Holo', 'Dupla Rara (RR)', 'Blister Triplo Megaevolução 1', 'Lote 2 — CoffeeCat (MEG)', '🌿', 'fi', 'br', 11.20, 8.00, 15.00, 'TCGPlayer jun/2026'),
  ('Chesnaught', '007/086 — Holo', 'Rara (Holo)', 'Blister Triplo ME04 PT-BR', 'Lote 2 — CoffeeCat (ME04)', '🌿', 'fi', 'bx', 1.14, null, null, 'Deck Certo jun/2026'),
  ('Donphan', '045/086 — Reverse Holo', 'Comum (RH)', 'Blister Triplo ME04 PT-BR', 'Lote 2 — CoffeeCat (ME04)', '🐘', 'fp', 'bx', 0.43, null, null, 'Deck Certo jun/2026'),
  ('Frogadier', '021/086 — Reverse Holo', 'Comum (RH)', 'Blister Triplo ME04 PT-BR', 'Lote 2 — CoffeeCat (ME04)', '🐸', 'fd', 'bx', 0.57, null, null, 'Deck Certo jun/2026'),
  ('Chespin', '005/086 — Reverse Holo', 'Comum (RH)', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '🌿', 'fi', 'bx', 0.46, null, null, 'Deck Certo jun/2026'),
  ('Vulpix', '008/086 — Reverse Holo', 'Comum (RH)', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '🦊', 'fi', 'bx', 0.45, null, null, 'Deck Certo jun/2026'),
  ('Delphox', '013/086 — Holo', 'Rara (Holo)', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '🔥', 'fi', 'bx', 3.25, null, null, 'Deck Certo jun/2026'),
  ('Bergmite', '023/086 — Reverse Holo', 'Comum (RH)', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '❄️', 'fp', 'bx', 0.44, null, null, 'Deck Certo jun/2026'),
  ('Toxel', 'Promo — Blister (2ª cópia)', 'Promocional', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '⚡', 'fp', 'bp', 9.00, 7.00, 14.00, 'Estimado'),
  ('Tranquilidade do AZ', '076/086 — Reverse Holo', 'Incomum (RH)', 'Patch 4 Boosters ME04', 'Lote 3 — Patch ME04', '🕊️', 'fp', 'bx', 0.83, null, null, 'Deck Certo jun/2026'),
  ('Bulbasaur', 'MEP037 — IR', 'Ilustração Rara (IR)', 'Coleção Parceiros Iniciais', 'Lote 4 — Parceiros Iniciais', '🌱', 'fi', 'bi', 15.00, 10.00, 25.00, 'Estimado jun/2026'),
  ('Charmander', 'MEP038 — IR', 'Ilustração Rara (IR)', 'Coleção Parceiros Iniciais', 'Lote 4 — Parceiros Iniciais', '🔥', 'fi', 'bi', 15.00, 10.00, 25.00, 'Estimado jun/2026'),
  ('Squirtle', 'MEP039 — IR', 'Ilustração Rara (IR)', 'Coleção Parceiros Iniciais', 'Lote 4 — Parceiros Iniciais', '💧', 'fp', 'bi', 15.00, 10.00, 25.00, 'Estimado jun/2026'),
  ('Snover', '140/188 — IR', 'Ilustração Rara (IR)', 'Coleção Parceiros Iniciais', 'Lote 4 — Parceiros Iniciais', '❄️', 'fp', 'bi', 8.00, 5.00, 15.00, 'Estimado jun/2026');

-- 9. Inserir slots coletados iniciais
insert into collection (slot_key) values
  ('me04:015:F'), ('me04:065:F'), ('me04:096:SP'),
  ('me04:007:F'), ('me04:063:RH'), ('me04:045:RH'),
  ('me04:021:RH'), ('me04:005:RH'), ('me04:008:RH'),
  ('me04:013:F'), ('me04:023:RH'), ('me04:076:RH'),
  ('me02:068:F'), ('me02:049:RH'),
  ('me02:080:F'), ('me02:094:RH'),
  ('meg:099:RH'), ('meg:020:RH'),
  ('meg:073:F'), ('meg:003:F'),
  ('meg:140:SP')
on conflict (slot_key) do nothing;
