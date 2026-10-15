-- ================================================================
-- MyDeck — Preço sugerido do fabricante (msrp) · 15/10/2026
-- JÁ APLICADO no Supabase (migration lojas_msrp_setup) — arquivo só
-- pra registro. Usado por lojas_msrp.js.
-- ================================================================
ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS msrp NUMERIC;
ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS release_date DATE;

-- Produtos Celebração 30 Anos cadastrados (ids 67–75):
--   Blister Duplo c/ Moeda 69,99 · Blister Triplo Lucario/Exeggutor 99,99
--   Treinador Avançado 399,99 · Box Pôster 115,99 · Box Fichário 230,99
--   Box ex Sylveon/Greninja 169,99 · Combo de Boosters 199,99
-- Ainda sem catálogo no ML (cadastrar quando aparecer, com msrp):
--   Baralho Batalha 115,99 (30/10) · Minilata 77,99 · Box Miniatura
--   Mew/Mewtwo 245,99 · Premium Ditto 305,99 · Coleção Celebração 599,99 (06/11)
-- Ex.: UPDATE ml_search_terms SET msrp = 77.99, release_date = '2026-11-06' WHERE id = <id>;
