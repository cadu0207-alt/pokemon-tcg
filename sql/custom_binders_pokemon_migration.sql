-- ================================================================
-- MyDeck — FICHÁRIOS DE POKÉMON · Migração: posição exata das cartas
--
-- Fichários "de um Pokémon" (filter_config.type = 'pokemon') guardam,
-- além do filtro (dex/nome), a POSIÇÃO EXATA de cada carta arrastada
-- pro fichário — diferente dos fichários 'manual'/'preset', que só
-- filtram um conjunto de cartas (sem posição fixa na grade).
--
-- `pages` é um array de páginas; cada página é um array de tamanho
-- layout*layout (a mesma coluna `layout` que já existe pra 2/3/4),
-- onde cada posição é `null` (slot vazio) ou `{"set":"me04","n":"006",
-- "ver":"RH"}` (carta específica, com a versão exata escolhida).
--
-- Rodar depois de custom_binders_setup.sql já ter sido executado.
-- ================================================================

alter table custom_binders
  add column if not exists pages jsonb default '[]';

-- Pra conferir depois de rodar:
-- select id, name, layout, filter_config, pages from custom_binders where filter_config->>'type' = 'pokemon';
