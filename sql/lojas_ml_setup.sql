-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Setup
-- Execute este script no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- ================================================================

-- 1. Termos de busca cadastrados (ex: "booster pokemon me04", "etb charizard")
CREATE TABLE IF NOT EXISTS ml_search_terms (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  term       TEXT NOT NULL,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ml_search_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_terms" ON ml_search_terms;
CREATE POLICY "own_terms" ON ml_search_terms FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Histórico de preços encontrados (registro de cada busca ao longo do tempo)
CREATE TABLE IF NOT EXISTS ml_price_history (
  id         BIGSERIAL PRIMARY KEY,
  term_id    BIGINT REFERENCES ml_search_terms(id) ON DELETE CASCADE,
  ml_item_id TEXT,
  title      TEXT,
  price      NUMERIC,
  currency   TEXT DEFAULT 'BRL',
  url        TEXT,
  thumbnail  TEXT,
  seller     TEXT,
  found_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ml_price_history ENABLE ROW LEVEL SECURITY;

-- Leitura: só quem é dono do termo associado
DROP POLICY IF EXISTS "read_own_history" ON ml_price_history;
CREATE POLICY "read_own_history" ON ml_price_history FOR SELECT
  USING (term_id IN (SELECT id FROM ml_search_terms WHERE user_id = auth.uid()));

-- Inserção: aberta (permite registrar preços tanto pelo app quanto por uma
-- tarefa agendada rodando em background sem sessão de usuário logado)
DROP POLICY IF EXISTS "insert_history" ON ml_price_history;
CREATE POLICY "insert_history" ON ml_price_history FOR INSERT
  WITH CHECK (true);

-- 3. Cupons (lista híbrida: cadastro manual + o que a busca automática achar)
CREATE TABLE IF NOT EXISTS ml_coupons (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT,
  description  TEXT,
  discount     TEXT,          -- ex: "10% OFF", "R$ 20 OFF acima de R$ 150"
  valid_until  DATE,
  source       TEXT DEFAULT 'manual',   -- 'manual' | 'auto'
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ml_coupons ENABLE ROW LEVEL SECURITY;

-- Leitura pública (a aba fala com o público geral, cupons não são sigilosos)
DROP POLICY IF EXISTS "read_coupons" ON ml_coupons;
CREATE POLICY "read_coupons" ON ml_coupons FOR SELECT USING (true);

-- Escrita: só o dono da conta principal do Eduardo
DROP POLICY IF EXISTS "write_coupons" ON ml_coupons;
CREATE POLICY "write_coupons" ON ml_coupons FOR ALL
  USING (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b')
  WITH CHECK (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- ================================================================
-- Exemplo de cupom manual (edite/remova conforme quiser):
-- INSERT INTO ml_coupons (code, description, discount, valid_until, source)
-- VALUES ('POKEML10', 'Cupom de boas-vindas Mercado Livre', '10% OFF', '2026-12-31', 'manual');
-- ================================================================
