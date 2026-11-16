-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 3
-- Rode DEPOIS do lojas_ml_update2.sql (SQL Editor → Run)
--
-- O Mercado Livre não tem API pública pra gerar link de afiliado —
-- o "Gerador de produtos recomendados" só funciona logado, manual.
-- Então guardamos aqui o link meli.la que você mesmo gera lá e cola
-- no painel admin do site.
-- ================================================================

ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS affiliate_url TEXT;
