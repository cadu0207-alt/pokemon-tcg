-- 18/10/2026 — Nº de boosters corrigido com pesquisa na internet (anúncios das lojas e lançamentos oficiais).
-- Já aplicado em produção (migration ml_boosters_pesquisa_web_18out). boosters_nota = de onde veio o número;
-- boosters_estimado = true quando é inferência (padrão Copag: cartas ÷ 6), false quando há fonte ou o admin informou.
alter table public.ml_search_terms add column if not exists boosters_nota text;
-- Confirmados: Treinador Avançado ME03/ME05 = 20; Celebração 30 Anos: Treinador Avançado 9, Pôster 3, Pokémon ex 4; ETB inglês = 9;
--   Garchomp Premium = 6; Box Ilustração Parceiro Inicial = 2 (+1 pacote de promos).
-- Estimados: Treinador Avançado ME02/ME04/Heróis Excelsos e Box Mega Caos Asc. (121 cartas) = 20; boxes de 61 cartas = 10;
--   boxes de 48/49 cartas = 8; Premium 51 cartas = 8; Premium Mega Greninja (EN) = 8; Premium Bellibolt (EN) = 6.
-- Sem evidência (voltaram a nulo): 66 (Lillie Premium Tournament) e 72 (Box com Fichário Celebração 30 Anos).
