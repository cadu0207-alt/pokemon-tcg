-- ================================================================
-- SETUP AUTH — Pokémon TCG Dashboard
-- Rodar no Supabase: Dashboard → SQL Editor → New Query
-- ================================================================

-- PASSO 1: Adicionar coluna user_id nas 3 tabelas
-- (se já existir, o IF NOT EXISTS protege)
ALTER TABLE purchases    ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE pulled_cards ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE collection   ADD COLUMN IF NOT EXISTS user_id UUID;

-- PASSO 2: Ajustar unique constraint de collection
-- A chave única precisa ser (user_id, slot_key) e não só slot_key
ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_slot_key_key;
ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_pkey CASCADE;
-- Cria nova PK composta (se não tiver id próprio):
-- Se a tabela já tiver coluna id, use o bloco abaixo; senão comente
ALTER TABLE collection ADD CONSTRAINT collection_user_slot_unique UNIQUE (user_id, slot_key);

-- PASSO 3: Ativar Row Level Security (dados privados por usuário)
ALTER TABLE purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulled_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection   ENABLE ROW LEVEL SECURITY;

-- PASSO 4: Criar políticas — cada user vê/escreve SOMENTE seus dados
DROP POLICY IF EXISTS "own_purchases"    ON purchases;
DROP POLICY IF EXISTS "own_pulled_cards" ON pulled_cards;
DROP POLICY IF EXISTS "own_collection"   ON collection;

CREATE POLICY "own_purchases"    ON purchases    FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_pulled_cards" ON pulled_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_collection"   ON collection   FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- PASSO 5 (DEPOIS DO PRIMEIRO LOGIN):
-- Copie seu UUID de: Authentication → Users → seu email → User UID
-- Cole no lugar de 'SEU-UUID-AQUI' abaixo e rode:
-- ================================================================

-- UPDATE purchases    SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;
-- UPDATE pulled_cards SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;
-- UPDATE collection   SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;

-- ================================================================
-- PASSO 6: Configurar Google OAuth no Supabase
-- Dashboard → Authentication → Providers → Google → Enable
-- Você precisará de Client ID e Secret do Google Cloud Console:
--   https://console.cloud.google.com → APIs → Credentials → OAuth 2.0
--   Authorized redirect URI: https://dvkiodmhtzlkvmyyzelx.supabase.co/auth/v1/callback
-- ================================================================
