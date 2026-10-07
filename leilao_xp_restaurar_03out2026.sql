-- Leilão: restaura o XP (lance + vitória + conquistas) — 03/10/2026
--
-- CONTEXTO: o XP do leilão (xp_events_migration_23ago2026.sql) funcionou de 24/08 a 01/09/2026 e parou quando
-- leilao_preco_arremate_migration_01set2026.sql reescreveu place_bid()/close_round() a partir do leilao_setup.sql
-- original, sem os blocos de XP. Desde então nenhum lance/vitória gerou XP.
--
-- COMO RESTAURAMOS: MESCLAMOS os blocos de XP nas funções ATUAIS (nunca colar a versão de 23/08 por cima, ela
-- trazia a lógica antiga de "reserva"):
--   • place_bid():            +8 XP no 1º lance do usuário em cada leilão + conquista leilao_first_bid
--   • close_auction_as_sold():+70 XP ao vencedor + conquistas leilao_first_win / leilao_win_5 / leilao_win_20
--     (é o ponto único de fechamento: expiração via close_round() E arremate imediato via place_bid())
--   • close_round() NÃO muda (só chama close_auction_as_sold).
--
-- IDEMPOTÊNCIA: xp_award() grava em xp_event_log com UNIQUE (user_id, source, source_id) — o mesmo (usuário,
-- 'leilao_lance'|'leilao_vitoria', id do leilão) nunca credita duas vezes (cobrir e dar lance de novo no mesmo
-- leilão não rende XP extra; isso também barra "ping-pong" de contas). xp_unlock_achievement() também é idempotente,
-- então as conquistas usam ">=" (robusto a saltos de contagem) em vez de "=" como na versão de 23/08.
-- CREATE OR REPLACE preserva os GRANTs atuais (place_bid: authenticated+service_role; close_auction_as_sold: service_role).

create or replace function place_bid(p_auction_id bigint, p_amount numeric)
returns auctions
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- XP (restaurado 03/10/2026): 8 XP por leilão em que o usuário deu lance (source_id = id do leilão ⇒ só no
  -- 1º lance dele ali) + conquista "Primeiro Lance" (xp_unlock_achievement ignora se já desbloqueou).
  perform xp_award(auth.uid(), 'leilao_lance', p_auction_id::text, 8);
  perform xp_unlock_achievement(auth.uid(), 'leilao_first_bid');

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
$function$;


create or replace function close_auction_as_sold(p_auction_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auction   auctions%rowtype;
  v_round     auction_rounds%rowtype;
  v_addr      jsonb;
  v_email     text;
  v_order_id  bigint;
  v_win_count int;
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

  -- XP (restaurado 03/10/2026): 70 XP por leilão vencido + conquistas de marco. O count já enxerga este leilão
  -- (acabou de virar 'encerrado' com winner_id, na mesma transação).
  perform xp_award(v_auction.current_bidder, 'leilao_vitoria', p_auction_id::text, 70);
  select count(*) into v_win_count from auctions where winner_id = v_auction.current_bidder;
  if v_win_count >= 1  then perform xp_unlock_achievement(v_auction.current_bidder, 'leilao_first_win'); end if;
  if v_win_count >= 5  then perform xp_unlock_achievement(v_auction.current_bidder, 'leilao_win_5');    end if;
  if v_win_count >= 20 then perform xp_unlock_achievement(v_auction.current_bidder, 'leilao_win_20');   end if;

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
$function$;


-- ================================================================
-- BACKFILL EXECUTADO em 03/10/2026 (uma vez; idempotente, pode rodar de novo sem duplicar) — registro:
-- creditou o que ficou sem XP entre 01/09 (migração do arremate) e 03/10:
--   44 lances (+352 XP) + 24 vitórias (+1.680 XP) a partir de 24/08 01:29 UTC (início do XP do leilão),
--   e 45 conquistas de leilão atrasadas (leilao_first_bid 24, leilao_first_win 16, leilao_win_5 5 = +2.390 XP),
--   que são por ESTADO (quem já tinha dado lance/vencido, mesmo antes de 24/08). 25 usuários afetados.
-- Conquistas desbloqueadas em ordem cronológica do 1º evento (define o "pioneiro" de forma justa).
-- Resultado: xp_event_log leilao_lance 56→100, leilao_vitoria 29→53; user_achievements 'leilao%' 4→49.
--
-- do $bf$ declare r record; t timestamptz := '2026-08-24 01:29:02+00'; begin
--   for r in select b.bidder_id u, b.auction_id a from auction_bids b group by 1,2 having min(b.created_at) >= t order by min(b.created_at)
--   loop perform xp_award(r.u, 'leilao_lance', r.a::text, 8); end loop;
--   for r in select a.winner_id u, a.id a from auctions a where a.winner_id is not null and a.updated_at >= t order by a.updated_at, a.id
--   loop perform xp_award(r.u, 'leilao_vitoria', r.a::text, 70); end loop;
--   for r in
--     select bidder_id u, 'leilao_first_bid' code, min(created_at) ts from auction_bids group by bidder_id
--     union all select winner_id, 'leilao_first_win', min(updated_at) from auctions where winner_id is not null group by winner_id
--     union all select u, 'leilao_win_5', ts from (select winner_id u, updated_at ts, row_number() over (partition by winner_id order by updated_at, id) rn from auctions where winner_id is not null) w where rn = 5
--     union all select u, 'leilao_win_20', ts from (select winner_id u, updated_at ts, row_number() over (partition by winner_id order by updated_at, id) rn from auctions where winner_id is not null) w where rn = 20
--     order by ts
--   loop perform xp_unlock_achievement(r.u, r.code); end loop;
-- end $bf$;
