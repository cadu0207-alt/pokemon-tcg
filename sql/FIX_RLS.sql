-- ================================================================
-- FIX: Isolamento de dados por usuário
-- Execute no Supabase → SQL Editor
-- ================================================================

-- 1. Garantir RLS ativo em todas as tabelas
ALTER TABLE purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulled_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection   ENABLE ROW LEVEL SECURITY;

-- 2. Recriar policies (limpa antigas e recria)
DROP POLICY IF EXISTS "own_purchases"   ON purchases;
DROP POLICY IF EXISTS "own_pulled_cards" ON pulled_cards;
DROP POLICY IF EXISTS "own_collection"  ON collection;

CREATE POLICY "own_purchases"
  ON purchases FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_pulled_cards"
  ON pulled_cards FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_collection"
  ON collection FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Verificar se user_id foi preenchido
-- Rode este SELECT para ver quantos registros ainda têm user_id NULL:
-- SELECT 'purchases' as tb, count(*) FROM purchases WHERE user_id IS NULL
-- UNION ALL
-- SELECT 'pulled_cards', count(*) FROM pulled_cards WHERE user_id IS NULL
-- UNION ALL
-- SELECT 'collection', count(*) FROM collection WHERE user_id IS NULL;

-- 4. Se tiver registros sem user_id (do Eduardo), rode com seu UUID:
-- (Vá em Authentication → Users, copie o UUID da conta principal)
-- UPDATE purchases    SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;
-- UPDATE pulled_cards SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;
-- UPDATE collection   SET user_id = 'SEU-UUID-AQUI' WHERE user_id IS NULL;
