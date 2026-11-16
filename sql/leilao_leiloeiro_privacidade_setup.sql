-- ================================================================
-- MyDeck — PRIVACIDADE ENTRE LEILOEIROS (29/08/2026)
-- Execute no Supabase SQL Editor DEPOIS de leilao_setup.sql (e de
-- leilao_seller_onboarding_setup.sql, se ainda não rodou).
--
-- Problema reportado: qualquer leiloeiro autorizado (is_auction_admin())
-- conseguia editar/cancelar/excluir cartas e rodadas de OUTROS
-- leiloeiros, e via os pedidos, valores, nomes/whatsapp de compradores
-- e custo de aquisição de TODO MUNDO — não só do que ele mesmo
-- cadastrou. Essa migração restringe isso: cada leiloeiro (exceto o
-- admin principal, Eduardo) só gerencia/vê em detalhe o que É DELE —
-- tanto no Leilão quanto na Loja do Leiloeiro. Rodadas continuam
-- compartilhadas (várias pessoas cadastram cartas na mesma rodada) —
-- só a EDIÇÃO da rodada (datas etc) fica restrita a quem criou.
--
-- Pedidos do leilão (auction_orders) são um caso especial: um pedido é
-- um carrinho por RODADA (pode juntar cartas de mais de um leiloeiro,
-- "um PIX cobre tudo" por desenho já existente). Por isso um leiloeiro
-- só enxerga o pedido se tiver pelo menos 1 carta dele ali dentro — o
-- valor total do pedido continua sendo o combinado (ver leilao.js).
-- Na Loja isso não existe (cada reserva é de 1 item só), então lá a
-- separação é limpa.
-- ================================================================

create or replace function is_auction_super_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b';
$$;
grant execute on function is_auction_super_admin(uuid) to authenticated;

-- ── 1. RODADAS — SELECT/INSERT continuam abertos (compartilhada);
-- UPDATE/DELETE (datas, cancelar, excluir) só quem criou ou o principal.
drop policy if exists "auction_rounds_update_admin" on auction_rounds;
create policy "auction_rounds_update_admin" on auction_rounds
  for update using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

drop policy if exists "auction_rounds_delete_admin" on auction_rounds;
create policy "auction_rounds_delete_admin" on auction_rounds
  for delete using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

-- ── 2. LEILÕES (cartas) — só quem cadastrou (ou o principal) edita/exclui.
drop policy if exists "auctions_update_admin" on auctions;
create policy "auctions_update_admin" on auctions
  for update using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

drop policy if exists "auctions_delete_admin" on auctions;
create policy "auctions_delete_admin" on auctions
  for delete using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

-- ── 3. CUSTO DE AQUISIÇÃO — privado por leiloeiro (o que ele pagou pela
-- carta é dado dele, não dos outros).
drop policy if exists "auction_costs_admin_all" on auction_costs;
create policy "auction_costs_admin_all" on auction_costs
  for all using (
    is_auction_super_admin()
    or exists(select 1 from auctions a where a.id = auction_id and a.created_by = auth.uid())
  ) with check (
    is_auction_super_admin()
    or exists(select 1 from auctions a where a.id = auction_id and a.created_by = auth.uid())
  );

drop policy if exists "store_item_costs_admin_all" on store_item_costs;
create policy "store_item_costs_admin_all" on store_item_costs
  for all using (
    is_auction_super_admin()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  ) with check (
    is_auction_super_admin()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  );

-- ── 4. PEDIDOS DO LEILÃO ──────────────────────────────────────────
drop policy if exists "auction_orders_select" on auction_orders;
create policy "auction_orders_select" on auction_orders
  for select using (
    buyer_id = auth.uid()
    or is_auction_super_admin()
    or exists(
      select 1 from auction_order_items oi join auctions a on a.id = oi.auction_id
      where oi.order_id = auction_orders.id and a.created_by = auth.uid()
    )
  );

drop policy if exists "auction_orders_update_admin" on auction_orders;
create policy "auction_orders_update_admin" on auction_orders
  for update using (
    is_auction_super_admin()
    or exists(
      select 1 from auction_order_items oi join auctions a on a.id = oi.auction_id
      where oi.order_id = auction_orders.id and a.created_by = auth.uid()
    )
  );

drop policy if exists "auction_order_items_select" on auction_order_items;
create policy "auction_order_items_select" on auction_order_items
  for select using (
    is_auction_super_admin()
    or exists(select 1 from auctions a where a.id = auction_id and a.created_by = auth.uid())
    or exists(select 1 from auction_orders o where o.id = order_id and o.buyer_id = auth.uid())
  );

-- ── 5. LOJA DO LEILOEIRO ──────────────────────────────────────────
drop policy if exists "store_items_admin_write" on store_items; -- policy antiga "for all", substituída pelas 3 abaixo

drop policy if exists "store_items_admin_insert" on store_items;
create policy "store_items_admin_insert" on store_items
  for insert with check (is_auction_admin() and created_by = auth.uid());

drop policy if exists "store_items_admin_update" on store_items;
create policy "store_items_admin_update" on store_items
  for update using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()))
  with check (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

drop policy if exists "store_items_admin_delete" on store_items;
create policy "store_items_admin_delete" on store_items
  for delete using (is_auction_admin() and (created_by = auth.uid() or is_auction_super_admin()));

drop policy if exists "store_reservations_select" on store_reservations;
create policy "store_reservations_select" on store_reservations
  for select using (
    buyer_id = auth.uid()
    or is_auction_super_admin()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  );

drop policy if exists "store_reservations_admin_update" on store_reservations;
create policy "store_reservations_admin_update" on store_reservations
  for update using (
    is_auction_super_admin()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  )
  with check (
    is_auction_super_admin()
    or exists(select 1 from store_items i where i.id = item_id and i.created_by = auth.uid())
  );

-- ── 6. TOTAIS COMBINADOS (sem PII) pra faixa de comissão continuar certa ─
-- A comissão é escalonada pelo volume PAGO TOTAL do mês somando TODOS os
-- leiloeiros (regra de negócio: mais volume junto = taxa menor pra todo
-- mundo). Como as tabelas de pedido acima agora ficam restritas por
-- leiloeiro, essas funções devolvem só o NÚMERO agregado (sem nome de
-- comprador, sem endereço, sem detalhe por item) — qualquer leiloeiro
-- autorizado pode chamar, mas só recebe o total, nunca as linhas.
create or replace function auction_orders_monthly_total(p_month_start timestamptz)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_total numeric;
begin
  if not is_auction_admin() then return 0; end if;
  select coalesce(sum(amount),0) into v_total
  from auction_orders
  where status in ('pago','enviado','concluido') and paid_at is not null and paid_at >= p_month_start;
  return v_total;
end;
$$;
grant execute on function auction_orders_monthly_total(timestamptz) to authenticated;

create or replace function store_reservations_monthly_total(p_month_start timestamptz)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_total numeric;
begin
  if not is_auction_admin() then return 0; end if;
  select coalesce(sum(unit_price*qty),0) into v_total
  from store_reservations
  where status in ('pago','enviado','concluido') and paid_at is not null and paid_at >= p_month_start;
  return v_total;
end;
$$;
grant execute on function store_reservations_monthly_total(timestamptz) to authenticated;
