-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 6
-- Rode DEPOIS do lojas_ml_update5.sql (SQL Editor → Run)
--
-- Contexto: o "Preço Justo" (ev_calculator.js) e o "Simulador de Packs"
-- (simulador.html) hoje usam preços de varejo fixos, digitados à mão
-- (MSRP estimado). Quando um produto já está cadastrado e rastreado em
-- Lojas & Ofertas, o preço real de mercado (menor preço achado no
-- catálogo do ML) é mais confiável — então vamos linkar os dois.
--
-- product_key é o mesmo ID que o ev_calculator.js já usa internamente
-- pra cada produto (ex: "me04-display", "me04-etb", "me04-blister4",
-- "me04-blister3", "me04-blister2", "me04-booster") — o Simulador usa
-- um mapeamento equivalente. Ao cadastrar/editar um produto em Lojas &
-- Ofertas, o admin escolhe (opcionalmente) a qual desses IDs ele
-- corresponde, e as duas outras abas passam a usar o preço real.
-- ================================================================

ALTER TABLE ml_search_terms ADD COLUMN IF NOT EXISTS product_key TEXT;
