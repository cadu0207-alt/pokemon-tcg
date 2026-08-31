-- ================================================================
-- MyDeck — LEILOEIROS DA EQUIPE + VISUALIZAÇÃO GERAL (29/08/2026)
-- Execute no Supabase SQL Editor DEPOIS de, nessa ordem: leilao_setup.sql,
-- leilao_seller_onboarding_setup.sql, leilao_leiloeiro_privacidade_setup.sql
-- e staff_access_setup.sql (todos precisam já estar rodados).
--
-- Pedido do Eduardo (29/08/2026): autorizar o Caio e o André (os outros
-- 2 admins/staff, staff_access) como leiloeiros — podem cadastrar cartas
-- e itens de loja próprios, igual qualquer leiloeiro — E dar pra eles
-- "visualização do leilão geral": ver TUDO (cartas, pedidos, valores,
-- comissão de TODO MUNDO), igual o Eduardo enxerga hoje.
--
-- IMPORTANTE: isso NÃO dá permissão de editar/excluir carta ou pedido de
-- OUTRO leiloeiro — isso continua só de quem cadastrou ou do Eduardo
-- (a migração de privacidade de 29/08 que restringiu isso continua
-- valendo). É só leitura ampliada.
--
-- Design: nova permissão 'leilao' em staff_access (ficou de fora de
-- propósito em 21/08 — "o leilão mexe com pagamentos reais, precisa de
-- revisão própria antes"; essa migração é essa revisão). Nova função
-- is_auction_viewer() = admin principal OU staff com 'leilao' marcada —
-- usada SÓ nas políticas de SELECT (leitura). As de UPDATE/DELETE
-- continuam com is_auction_super_admin() (só Eduardo) + dono, sem mudar.
-- ================================================================

create or replace function is_auction_viewer(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_auction_super_admin(p_uid)
      or exists(
        select 1 from staff_access
        where uid = p_uid and 'leilao' = any(permissions)
      );
$$;
grant execute on function is_auction_viewer(uuid) to authenticated;

-- ── LEILÃO: pedidos e itens de pedido — viewer enxerga tudo ────────
drop policy if exists "auction_orders_select" on auction_orders;
create policy "auction_orders_select" on auction_orders
  for select using (
    buyer_id = auth.uid()
    or is_auction_viewer()
    or exists(
      select 1 from auction_order_items oi join auctions a on a.id = oi.auction_id
      where oi.order_id = auction_orders.id and a.created_by = auth.uid()
    )
  );

drop policy if exists "auction_order_items_select" on auction_order_items;
create policy "auction_order_items_select" on auction_order_items
  for select using (
    is_auction_viewer()
    or exists(select 1 from auctions a where a.id = auction_id and a.created_by = auth.uid())
    or exists(select 1 from auction_orders o where o.id = order_id and o.buyer_id = auth.uid())
  );

-- ── LEILÃO: custo de aquisição — viewer só LÊ (edição continua só do
-- dono ou do Eduardo, via a policy auction_costs_admin_all já existente
-- — essa aqui só ACRESCENTA leitura, não mexe em insert/update/delete).
drop policy if exists "auction_costs_viewer_select" on auction_costs;
create policy "auction_costs_viewer_select" on auction_costs
  for select using (is_auction_viewer());

-- ── LOJA DO LEILOEIRO: reservas e custo — mesma ideia ──────────────
drop policy if exists "store_reservations_select" on store_reservations;
create policy "store_reservations_select" on store_reservations
  for select using (
    buyer_id = auth.uid()
    or is_auction_viewer()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  );

drop policy if exists "store_item_costs_viewer_select" on store_item_costs;
create policy "store_item_costs_viewer_select" on store_item_costs
  for select using (is_auction_viewer());

-- ================================================================
-- Depois de rodar tudo acima, ainda no SQL Editor: autoriza o Caio e o
-- André como LEILOEIROS (podem cadastrar cartas/itens próprios). Os dois
-- já logaram no site pelo menos 1x (são staff), então isso já funciona:
-- ================================================================
select add_auction_admin('caiofernandowork@gmail.com', 'Caio');
select add_auction_admin('andresollecito@hotmail.com', 'André');

-- ================================================================
-- Por último, no SITE (logado como Eduardo): aba Admin → bloco "Equipe"
-- → marque a caixinha nova "🏆 Leilão (visualização geral)" pro Caio e
-- pro André e clique "Salvar permissões" em cada um. Isso ativa
-- is_auction_viewer() pra eles — sem essa caixinha marcada eles são
-- leiloeiros normais (só veem o que cadastram), igual qualquer outro.
-- ================================================================
