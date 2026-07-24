-- ================================================================
-- MyDeck — CARTAS À VENDA · Tabela card_listings
--
-- Guarda as cartas que o Eduardo marcou como "à venda" na aba
-- Cartas Tiradas & À Venda. Uma linha por versão/slot (N, F, RH, SP)
-- de uma carta específica — não agrega versões diferentes.
--
-- slot_key segue o mesmo formato usado em `collection`:
--   "<setId>:<n>:<ver>"  ex: "me04:001:N"
-- Isso permite conferir a quantidade disponível cruzando com
-- collection.quantity pelo mesmo slot_key.
--
-- discount_type guarda como o preço foi calculado:
--   'liga_5' | 'liga_10' | 'liga_15' | 'liga_20' | 'liga_25' | 'liga_30' | 'individual'
-- liga_price guarda o preço de Liga de referência no momento do anúncio
-- (para exibir "R$X (Liga R$Y, -10%)" mesmo se o preço de liga mudar depois).
-- ================================================================

create table if not exists card_listings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  slot_key text not null,
  set_id text not null,
  card_n text not null,
  version text not null,
  card_name text not null,
  qty integer not null default 1 check (qty > 0),
  price numeric not null check (price >= 0),
  discount_type text not null default 'liga_10',
  liga_price numeric,
  condition text not null default 'M' check (condition in ('M','NM','MP','D')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot_key)
);

alter table card_listings enable row level security;

drop policy if exists "card_listings_select_own" on card_listings;
create policy "card_listings_select_own" on card_listings
  for select using (user_id = auth.uid());

drop policy if exists "card_listings_insert_own" on card_listings;
create policy "card_listings_insert_own" on card_listings
  for insert with check (user_id = auth.uid());

drop policy if exists "card_listings_update_own" on card_listings;
create policy "card_listings_update_own" on card_listings
  for update using (user_id = auth.uid());

drop policy if exists "card_listings_delete_own" on card_listings;
create policy "card_listings_delete_own" on card_listings
  for delete using (user_id = auth.uid());

-- Pra conferir depois de rodar:
-- select * from card_listings where user_id = auth.uid();
