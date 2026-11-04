-- ================================================================
-- MyDeck — ABRIR VISIBILIDADE DE card_listings (pro Book de Compra/Venda)
-- Rodar no SQL Editor do Supabase — seguro rodar por cima da policy antiga.
--
-- Até aqui (card_listings_setup.sql original), a policy de SELECT só
-- deixava cada usuário ver o próprio anúncio ("user_id = auth.uid()").
-- Isso impedia existir um "book" de verdade: pra alguém saber que existe
-- gente vendendo uma carta e por qual preço, o anúncio de venda (lado
-- ask) precisa ser tão público quanto já é o lado bid (buy_orders, ver
-- buy_orders_setup.sql, policy "status = 'ativa' or buyer_id = auth.uid()").
--
-- Decisão confirmada com o Eduardo (19/08/2026, via AskUserQuestion):
-- abrir SELECT pra qualquer usuário logado — mesmo modelo do buy_orders.
-- Preço e quantidade ficam visíveis pra todo mundo; INSERT/UPDATE/DELETE
-- continuam só do dono (policies antigas, inalteradas). Nenhum dado de
-- contato/endereço mora em card_listings — isso é só em card_offers/
-- user_addresses (marketplace_setup.sql), que não são afetadas aqui.
-- ================================================================

DROP POLICY IF EXISTS "card_listings_select_own" ON card_listings;
CREATE POLICY "card_listings_select_all" ON card_listings
  FOR SELECT
  USING (true);

-- Pra conferir depois de rodar:
-- select * from pg_policies where tablename = 'card_listings';
