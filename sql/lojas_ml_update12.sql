-- ================================================================
-- MyDeck — FILTRO POR COLEÇÃO · Update 12
-- Adiciona uma tag livre de "coleção" em cada produto rastreado
-- (ex: "Caos Ascendente", "Inglês"), usada pelo filtro que aparece
-- pros usuários na aba Lojas & Ofertas.
-- ================================================================

ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS collection TEXT;

-- Índice simples pra acelerar quando a lista de produtos crescer.
CREATE INDEX IF NOT EXISTS idx_ml_search_terms_collection ON ml_search_terms (collection);
