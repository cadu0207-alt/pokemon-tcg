-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 4
-- Rode DEPOIS do lojas_ml_update3.sql (SQL Editor → Run)
--
-- Contexto: descobrimos que a API do Mercado Livre bloqueou o acesso
-- de terceiros a /items/{id} e /sites/{site}/search (dá 403 pra
-- qualquer app, não é bug nosso). MAS os endpoints de CATÁLOGO
-- (/products/{id} e /products/{id}/items) continuam funcionando e já
-- trazem: nome, imagens reais do produto E o preço de cada vendedor —
-- desde que a chamada seja autenticada (token OAuth do app).
--
-- Por isso o cadastro muda de "termo de busca" (texto livre, buscava
-- na API pública quebrada) para "link de catálogo" (o link .../p/MLBxxxx
-- que já junta todos os vendedores do mesmo produto). A chamada
-- autenticada é feita por uma Supabase Edge Function (server-side —
-- só ela pode guardar o token do ML com segurança), não pelo navegador.
--
-- O que muda aqui:
-- 1) ml_search_terms ganha catalog_product_id (ex: "MLB69246167") e
--    image_url (imagem real do produto, vinda do catálogo do ML —
--    carrega automático no cadastro, sem precisar subir imagem à mão).
-- 2) Nova tabela ml_tokens: guarda o token OAuth do Mercado Livre que a
--    Edge Function usa e renova sozinha. Fica travada por RLS (sem
--    nenhuma política = ninguém lê/escreve via app; só a Edge Function,
--    que usa a service_role key e ignora RLS).
-- ================================================================

ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS catalog_product_id TEXT;
ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS ml_tokens (
  id            BIGSERIAL PRIMARY KEY,
  access_token  TEXT,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ml_tokens ENABLE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de propósito: com RLS ligado e zero políticas,
-- ninguém (anon nem authenticated) lê ou escreve nessa tabela pelo
-- app. Só a Edge Function acessa, via service_role key (que ignora RLS).

-- ================================================================
-- IMPORTANTE — rode isso uma vez manualmente, trocando o valor pelo
-- refresh_token que já está funcionando no PromoPoke (pegue no Neon
-- com: SELECT refresh_token FROM ml_tokens ORDER BY id DESC LIMIT 1;)
-- Isso reaproveita a autorização OAuth que você já fez — sem precisar
-- logar de novo no Mercado Livre.
--
-- INSERT INTO ml_tokens (refresh_token) VALUES ('COLE_AQUI_O_REFRESH_TOKEN');
-- ================================================================
