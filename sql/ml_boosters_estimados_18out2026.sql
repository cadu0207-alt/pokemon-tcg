-- 18/10/2026 — Nº de boosters estimado pela regra do Eduardo (inglês 9, português 6; promo e "mais N cartas" não contam).
-- Já aplicado em produção (migration ml_boosters_estimados_regra_idioma). boosters_estimado = true → a tela mostra "(estimado)".
alter table public.ml_search_terms add column if not exists boosters_estimado boolean not null default false;
update public.ml_search_terms set boosters = 9, boosters_estimado = true where boosters is null and id in (29,30,31,43,52,53,66,85);
update public.ml_search_terms set boosters = 6, boosters_estimado = true where boosters is null and id in (5,6,9,10,11,16,17,22,25,26,27,28,32,33,34,35,40,41,42,44,45,50,54,65,70,71,72,73,74,77,90);
update public.ml_search_terms set boosters = 18, boosters_estimado = true where boosters is null and id in (75,107);
update public.ml_search_terms set boosters = 4, boosters_estimado = true where boosters is null and id in (79);
update public.ml_search_terms set boosters = 3, boosters_estimado = true where id in (18);
