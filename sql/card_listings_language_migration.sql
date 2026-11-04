-- ================================================================
-- MyDeck — CARTAS À VENDA · Migração: idioma da carta anunciada
--
-- Adiciona `language` em card_listings — necessário pro novo card de
-- divulgação individual (modelo "produto"), que mostra o idioma da
-- edição junto com raridade, preço e estado de conservação.
--
-- Rodar depois de card_listings_setup.sql (e da migração de condition)
-- já terem sido executadas.
-- ================================================================

alter table card_listings
  add column if not exists language text not null default 'pt-BR'
  check (language in ('pt-BR','en','ja'));

-- Pra conferir depois de rodar:
-- select slot_key, card_name, condition, language from card_listings where user_id = auth.uid();
