-- 17/10/2026 — valor por booster na aba de busca do Mercado Livre.
-- boosters = nº de pacotes do produto, só quando é certo (escrito no nome ou definido pelo formato).
-- Boxes de coleção, ETBs em português, decks e acessórios ficam NULL até alguém confirmar o conteúdo.
alter table public.ml_search_terms add column if not exists boosters smallint check (boosters is null or boosters between 1 and 100);
update public.ml_search_terms set boosters = 36 where id in (3,12,13,19,21,49,78,83,102,106);
update public.ml_search_terms set boosters = 18 where id in (14,15,20,38,47);
update public.ml_search_terms set boosters = 9 where id in (94);
update public.ml_search_terms set boosters = 6 where id in (89);
update public.ml_search_terms set boosters = 4 where id in (8,23,24,37,48,82,96,97,99,109);
update public.ml_search_terms set boosters = 3 where id in (4,36,39,46,51,68,69,80,86,88,91,92,101);
update public.ml_search_terms set boosters = 2 where id in (67);
update public.ml_search_terms set boosters = 1 where id in (76,81,87,95,104,105);
