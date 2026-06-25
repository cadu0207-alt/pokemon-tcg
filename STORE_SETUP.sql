-- ================================================================
-- MyDeck — STORE SETUP
-- Execute este script no Supabase SQL Editor
-- ================================================================

-- 1. Tabela de perfis (user vs loja)
CREATE TABLE IF NOT EXISTS profiles (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  type      TEXT DEFAULT 'user' CHECK (type IN ('user','store')),
  store_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuário gerencia próprio perfil
DROP POLICY IF EXISTS "own_profile" ON profiles;
CREATE POLICY "own_profile" ON profiles FOR ALL USING (auth.uid() = user_id);

-- Qualquer usuário autenticado pode ver perfis do tipo 'store'
DROP POLICY IF EXISTS "read_stores" ON profiles;
CREATE POLICY "read_stores" ON profiles FOR SELECT TO authenticated USING (type = 'store');

-- 2. Adicionar coluna quantity à collection (1 por padrão para usuários normais)
ALTER TABLE collection ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- 3. Permitir usuários autenticados lerem collection das lojas
DROP POLICY IF EXISTS "read_store_collection" ON collection;
CREATE POLICY "read_store_collection" ON collection FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT user_id FROM profiles WHERE type = 'store')
  );

-- ================================================================
-- PASSO MANUAL: Após rodar este script, vá em:
-- Authentication → Users → copie o UUID da conta da loja
-- E rode:
-- INSERT INTO profiles (user_id, type, store_name)
-- VALUES ('UUID-DA-LOJA-AQUI', 'store', 'iWorld TCG')
-- ON CONFLICT (user_id) DO UPDATE SET type='store', store_name='iWorld TCG';
-- ================================================================
