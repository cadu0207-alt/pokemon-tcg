-- ================================================================
-- MyDeck — CARTAS À VENDA · Migração: estado de conservação (condition)
--
-- Adiciona o campo `condition` em card_listings, pra registrar o estado
-- físico da carta anunciada:
--   'M'  → Nova / Mint
--   'NM' → Praticamente Nova / Near Mint
--   'MP' → Usada Moderadamente / Moderately Played
--   'D'  → Danificada / Damaged
--
-- Rodar depois de card_listings_setup.sql já ter sido executado.
-- ================================================================

alter table card_listings
  add column if not exists condition text not null default 'M'
  check (condition in ('M','NM','MP','D'));

-- Pra conferir depois de rodar:
-- select slot_key, card_name, condition from card_listings where user_id = auth.uid();
