-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 5
-- Rode DEPOIS do lojas_ml_update4.sql (SQL Editor → Run)
--
-- Contexto: o Mercado Livre não tem API pública de cupons de terceiros
-- (só o próprio vendedor cria/consulta os cupons dele) e os agregadores
-- (Pelando, Cuponomia) bloqueiam acesso automatizado — então cupom
-- "achado sozinho pelo site" não é viável. O fluxo real é: você testa
-- os cupons manualmente no produto, e quando encontra um que funciona,
-- cadastra ele vinculado àquele produto específico — o site então
-- calcula e mostra o preço já com desconto na vitrine.
--
-- O que muda aqui:
-- 1) ml_coupons ganha term_id (liga o cupom a um produto rastreado
--    específico — fica NULL pros cupons genéricos/antigos)
-- 2) discount_type ('percent' ou 'fixed') e discount_value (número) —
--    permitem calcular o preço com desconto automaticamente, além do
--    campo de texto livre "discount" que já existia (só pra exibição)
-- ================================================================

ALTER TABLE ml_coupons ADD COLUMN IF NOT EXISTS term_id BIGINT REFERENCES ml_search_terms(id) ON DELETE CASCADE;
ALTER TABLE ml_coupons ADD COLUMN IF NOT EXISTS discount_type TEXT;   -- 'percent' | 'fixed'
ALTER TABLE ml_coupons ADD COLUMN IF NOT EXISTS discount_value NUMERIC;

-- ================================================================
-- Exemplo (não precisa rodar — o admin cadastra isso pelo próprio site):
-- INSERT INTO ml_coupons (term_id, code, description, discount, discount_type, discount_value, source)
-- VALUES (2, 'XXXXXX', 'Cupom exclusivo testado', '10% OFF', 'percent', 10, 'manual');
-- ================================================================
