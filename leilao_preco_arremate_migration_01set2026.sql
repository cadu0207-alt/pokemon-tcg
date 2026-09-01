-- ================================================================
-- MyDeck — "Preço de Arremate" (antigo "preço de reserva") — 01/09/2026
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
--
-- Pedido do Eduardo: o campo que hoje é "preço de reserva" (oculto,
-- mínimo pra vender — se ninguém cobrisse, o leilão terminava SEM
-- vencedor) passa a ser "preço de arremate" (visível pro comprador,
-- opcional): se o leiloeiro coloca um valor e ALGUÉM dá um lance que
-- bate nesse valor, o leilão encerra NA HORA com esse lance vencendo —
-- não precisa esperar o prazo normal acabar.
--
-- O que muda:
--   1. Renomeia a coluna `auctions.reserve_price` → `buy_now_price`.
--   2. Novo helper `close_auction_as_sold()` — fecha UM leilão como
--      vendido (ou sem vencedor, se ninguém deu lance), usado tanto
--      pelo fechamento normal (fim do prazo) quanto pelo gatilho de
--      arremate imediato.
--   3. `place_bid()` — depois de registrar o lance, se bateu o preço de
--      arremate, chama close_auction_as_sold() na hora.
--   4. `close_round()` — não filtra mais por reserva batida (isso não
--      existe mais); QUALQUER lance vencedor no prazo normal agora gera
--      pedido, igual antes de reserve_price existir. Reusa o helper
--      novo em vez de duplicar a lógica de fechar+criar pedido.
--
-- Rodar isso não afeta leilões já encerrados — só muda o comportamento
-- dos próximos.
-- ================================================================

-- ── 1. Renomear a coluna (idempotente) ────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'auctions' and column_name = 'reserve_price'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'auctions' and column_name = 'buy_now_price'
  ) then
    alter table auctions rename column reserve_price to buy_now_price;
  end if;
end $$;

-- ── 2. Helper: fecha UM leilão como vendido (ou sem vencedor) ─────
-- Idempotente — se já não estiver 'ativo', não faz nada. Cria o pedido
-- (auction_orders/auction_order_items) igual close_round fazia inline
-- antes; agora os dois fluxos (fim de prazo normal e arremate
-- imediato) chamam esse mesmo código, em vez de duplicar.
create or replace function close_auction_as_sold(p_auction_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction  auctions%rowtype;
  v_round    auction_rounds%rowtype;
  v_addr     jsonb;
  v_email    text;
  v_order_id bigint;
begin
  select * into v_auction from auctions where id = p_auction_id for update;
  if not found or v_auction.status <> 'ativo' then
    return; -- já processado (idempotente) ou não existe
  end if;

  if v_auction.current_bidder is null then
    update auctions set status = 'encerrado', updated_at = now() where id = p_auction_id;
    return;
  end if;

  select * into v_round from auction_rounds where id = v_auction.round_id;

  update auctions set
    status = 'encerrado', winner_id = v_auction.current_bidder, winning_bid = v_auction.current_bid,
    updated_at = now()
  where id = p_auction_id;

  select to_jsonb(a) into v_addr from user_addresses a where a.user_id = v_auction.current_bidder;
  select email into v_email from auth.users where id = v_auction.current_bidder;

  insert into auction_orders (round_id, buyer_id, amount, payment_due_at, buyer_email, shipping_snapshot)
  values (v_auction.round_id, v_auction.current_bidder, v_auction.current_bid, v_round.payment_due_at, v_email, v_addr)
  on conflict (round_id, buyer_id) do update set
    amount = auction_orders.amount + excluded.amount,
    updated_at = now()
  returning id into v_order_id;

  insert into auction_order_items (order_id, auction_id, amount)
  values (v_order_id, p_auction_id, v_auction.current_bid)
  on conflict (auction_id) do nothing;
end;
$$;

grant execute on function close_auction_as_sold(bigint) to authenticated;

-- ── 3. place_bid() — gatilho de arremate imediato ─────────────────
create or replace function place_bid(p_auction_id bigint, p_amount numeric)
returns auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction  auctions%rowtype;
  v_min_next numeric;
  v_now      timestamptz := now();
  v_blocked  boolean;
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado para dar lance.';
  end if;

  select blocked into v_blocked from auction_bidder_flags where user_id = auth.uid();
  if v_blocked then
    raise exception 'Você está temporariamente bloqueado de dar lances por pagamento pendente de uma rodada anterior. Fale com o leiloeiro pra liberar.';
  end if;

  if not exists(select 1 from auction_rules_acceptance where user_id = auth.uid() and rules_version = 'v1') then
    raise exception 'Você precisa aceitar as regras do leilão antes de dar o primeiro lance.';
  end if;

  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Leilão não encontrado.';
  end if;

  if v_auction.status <> 'ativo' or v_now < v_auction.start_at or v_now > v_auction.end_at then
    raise exception 'Este leilão não está aceitando lances no momento.';
  end if;

  if v_auction.created_by = auth.uid() then
    raise exception 'O leiloeiro não pode dar lance no próprio leilão.';
  end if;

  if v_auction.current_bidder = auth.uid() then
    raise exception 'Você já é o maior lance deste leilão — aguarde outro participante cobrir.';
  end if;

  if v_auction.current_bid is null then
    v_min_next := v_auction.starting_price;
  else
    v_min_next := v_auction.current_bid + auction_min_increment(v_auction.current_bid);
  end if;

  if p_amount < v_min_next then
    raise exception 'Lance mínimo atual é R$ %', to_char(v_min_next, 'FM999999990.00');
  end if;

  insert into auction_bids (auction_id, bidder_id, amount) values (p_auction_id, auth.uid(), p_amount);

  update auctions set
    current_bid    = p_amount,
    current_bidder = auth.uid(),
    bid_count      = bid_count + 1,
    end_at = case
      when v_auction.anti_snipe_minutes > 0
       and v_auction.end_at - v_now < (v_auction.anti_snipe_minutes || ' minutes')::interval
      then v_now + (v_auction.anti_snipe_minutes || ' minutes')::interval
      else v_auction.end_at
    end,
    updated_at = v_now
  where id = p_auction_id
  returning * into v_auction;

  -- "Preço de arremate" (01/09/2026): se o leiloeiro definiu um valor e
  -- o lance atingiu ele, o leilão encerra NA HORA com esse lance como
  -- vencedor — visível pro comprador (diferente do antigo "preço de
  -- reserva", que era oculto e só bloqueava a venda).
  if v_auction.buy_now_price is not null and p_amount >= v_auction.buy_now_price then
    perform close_auction_as_sold(p_auction_id);
    select * into v_auction from auctions where id = p_auction_id;
  end if;

  return v_auction;
end;
$$;

grant execute on function place_bid(bigint, numeric) to authenticated;

-- ── 4. close_round() — não depende mais de "reserva batida" ───────
create or replace function close_round(p_round_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_auction    record;
  v_round      auction_rounds%rowtype;
  v_still_open boolean;
begin
  select * into v_round from auction_rounds where id = p_round_id for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;

  for r_auction in
    select id from auctions
    where round_id = p_round_id and status = 'ativo' and now() > end_at
    for update
  loop
    perform close_auction_as_sold(r_auction.id);
  end loop;

  select exists(select 1 from auctions where round_id = p_round_id and status = 'ativo') into v_still_open;
  if not v_still_open and v_round.status <> 'encerrado' then
    update auction_rounds set status = 'encerrado', updated_at = now() where id = p_round_id;
  end if;
end;
$$;

grant execute on function close_round(bigint) to authenticated;
