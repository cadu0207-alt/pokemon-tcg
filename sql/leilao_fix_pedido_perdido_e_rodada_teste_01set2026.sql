-- ================================================================
-- MyDeck — (1) Reabrir o leilão de teste que terminou sem vencedor
--          (2) Criar uma rodada de teste pro "preço de arremate"
-- Execute no Supabase SQL Editor DEPOIS de já ter rodado
-- leilao_preco_arremate_migration_01set2026.sql (este script usa a
-- função close_auction_as_sold criada por ela).
-- ================================================================

-- ── 1. CONSERTAR O LEILÃO QUE JÁ TERMINOU SEM VENCEDOR ────────────
-- Acha qualquer leilão que fechou com um lance válido mas SEM vencedor
-- (era a regra antiga: se não batia a "reserva oculta", não vendia) e
-- reprocessa ele com a regra nova (close_auction_as_sold), que agora
-- sempre declara vencedor quem tinha o maior lance. Idempotente — se
-- rodar de novo sem ter nada pendente, não faz nada.
do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id, card_name, current_bid, current_bidder
    from auctions
    where status = 'encerrado' and current_bidder is not null and winner_id is null
  loop
    update auctions set status = 'ativo' where id = r.id; -- reabre só pra reprocessar
    perform close_auction_as_sold(r.id);
    v_count := v_count + 1;
    raise notice 'Reprocessado: auction_id=%, carta=%, lance=%', r.id, r.card_name, r.current_bid;
  end loop;
  raise notice 'Total reprocessado: % leilão(ões)', v_count;
end $$;

-- Conferir o resultado (deve aparecer com status=encerrado, winner_id
-- preenchido, e um auction_orders correspondente):
-- select id, card_name, status, winner_id, winning_bid from auctions where winner_id is not null order by id desc limit 5;
-- select * from auction_orders order by id desc limit 5;

-- ── 2. RODADA DE TESTE — "preço de arremate" ──────────────────────
-- Cria uma rodada já ATIVA com 1 carta de teste: preço inicial R$1,00
-- e preço de arremate R$5,00 — dá um lance de R$5 (ou mais) nela pra
-- ver o leilão encerrar sozinho, virar pedido, e aparecer em
-- "📬 Pedidos & Envios".
--
-- IMPORTANTE: o leiloeiro (created_by) NÃO PODE dar lance no próprio
-- leilão (place_bid bloqueia isso de propósito). Pra testar de
-- verdade — incluindo o botão "🎯 Arremate Já" e a simulação de frete —
-- entre com uma SEGUNDA conta (a sua mesmo, numa aba anônima, ou
-- peça pra alguém de confiança) e dê o lance por ela.
do $$
declare
  v_user_id    uuid;
  v_round_id   bigint;
  v_auction_id bigint;
begin
  select id into v_user_id from auth.users where email = 'cadu0207@gmail.com';
  if v_user_id is null then
    raise exception 'E-mail cadu0207@gmail.com não encontrado em auth.users — ajuste o e-mail no script pro seu usuário leiloeiro.';
  end if;

  insert into auction_rounds (created_by, title, start_at, end_at, payment_due_at, shipping_note, status)
  values (
    v_user_id,
    'Rodada de Teste — Preço de Arremate (01/09/2026)',
    now(),
    now() + interval '2 hours',
    now() + interval '2 days',
    'Rodada de teste — pode cancelar/arquivar depois de testar.',
    'ativo'
  )
  returning id into v_round_id;

  insert into auctions (round_id, created_by, card_name, condition, language, starting_price, buy_now_price, package_type, start_at, end_at, status)
  values (
    v_round_id, v_user_id,
    'Carta de Teste — Arremate',
    'M', 'pt-BR',
    1.00,   -- preço inicial
    5.00,   -- preço de arremate: um lance de R$5+ encerra na hora
    'avulsa',
    now(), now() + interval '2 hours',
    'ativo'
  )
  returning id into v_auction_id;

  raise notice 'Rodada de teste criada — round_id=%, auction_id=%. Dê um lance de R$ 5,00+ com uma SEGUNDA conta pra testar o arremate imediato.', v_round_id, v_auction_id;
end $$;
