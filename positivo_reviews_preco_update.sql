-- ================================================================
-- MyDeck — PREÇO SUGERIDO nas avaliações do Cadastro Positivo (positivo.js)
-- Execute no Supabase SQL Editor DEPOIS de positivo_reviews_setup.sql
-- (app.supabase.com → SQL Editor → Run)
--
-- Adiciona o campo "preço sugerido" na avaliação — o valor que o próprio
-- usuário pagou ou viu de bom na loja. É o dado que sustenta o banner
-- "Lojas com Preços Recomendados" na aba: os preços vêm da comunidade,
-- não de nós.
-- ================================================================

alter table company_reviews add column if not exists preco_sugerido numeric check (preco_sugerido is null or preco_sugerido > 0);

-- Pra conferir depois de rodar:
-- select c.nome, r.preco_sugerido, r.nota, r.tipo, r.created_at
-- from company_reviews r join positive_companies c on c.id = r.company_id
-- where r.preco_sugerido is not null
-- order by r.created_at desc;
