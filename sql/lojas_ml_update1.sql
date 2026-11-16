-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 1
-- Rode DEPOIS do lojas_ml_setup.sql (SQL Editor → Run)
--
-- O que muda:
-- 1) Só o Eduardo (admin) cadastra/edita/remove termos de busca —
--    todo mundo mais só VÊ a vitrine de produtos já cadastrados.
-- 2) Novo campo "label" (nome amigável do produto, ex: "Booster ME04")
-- 3) Novo campo "featured" (destaque de promoção na vitrine)
-- 4) Histórico de preço fica público para leitura (precisa disso pra
--    mostrar o menor preço já registrado pra qualquer visitante)
-- ================================================================

-- 1. Novas colunas em ml_search_terms
ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- 2. Políticas de ml_search_terms: leitura pública, escrita só do admin
DROP POLICY IF EXISTS "own_terms" ON ml_search_terms;

DROP POLICY IF EXISTS "read_terms_public" ON ml_search_terms;
CREATE POLICY "read_terms_public" ON ml_search_terms FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "admin_write_terms" ON ml_search_terms;
CREATE POLICY "admin_write_terms" ON ml_search_terms FOR INSERT
  WITH CHECK (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

DROP POLICY IF EXISTS "admin_update_terms" ON ml_search_terms;
CREATE POLICY "admin_update_terms" ON ml_search_terms FOR UPDATE
  USING (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b')
  WITH CHECK (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

DROP POLICY IF EXISTS "admin_delete_terms" ON ml_search_terms;
CREATE POLICY "admin_delete_terms" ON ml_search_terms FOR DELETE
  USING (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- 3. Políticas de ml_price_history: leitura pública (pra mostrar o menor
--    preço já registrado pra qualquer visitante), inserção continua aberta
DROP POLICY IF EXISTS "read_own_history" ON ml_price_history;
DROP POLICY IF EXISTS "read_history_public" ON ml_price_history;
CREATE POLICY "read_history_public" ON ml_price_history FOR SELECT
  USING (true);

-- (a política "insert_history" criada no setup inicial continua valendo)

-- ================================================================
-- Exemplo de termo cadastrado pelo admin (rode manualmente se quiser
-- popular alguns produtos de exemplo — troque pelo que você quer rastrear):
-- INSERT INTO ml_search_terms (user_id, term, label, featured)
-- VALUES ('eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b', 'booster box pokemon me04', 'Booster Box ME04 — Caos Ascendente', false);
-- ================================================================
