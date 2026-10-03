-- ================================================================
-- MyDeck — REVISÃO DAS FUNÇÕES SECURITY DEFINER ABERTAS A VISITANTE (03/10/2026)
-- Continuação de otimizacao_banco_03out2026.sql: sobraram 14 funções (+5 de
-- gatilho) executáveis por anon. Cada uma foi lida e classificada.
--
-- REVOGADAS agora (authenticated e service_role continuam):
--   auction_order_buyer_id(order)      → anon descobria o comprador (uuid) de qualquer pedido
--                                        (id sequencial) e cruzava com profiles (nome público)
--   auction_order_has_item_by_creator  → só auxiliar de policy de pedidos (visitante não lê pedidos)
--   has_accepted_seller_terms          → idem, policy de INSERT de leiloeiro
--   expire_store_reservations          → escrita pública sem necessidade (só o leilão logado chama)
--   fn_news_view_counts                → estatística de admin (home_content_admin.js)
--   get_raffle_number_counts           → só a aba Rifas (exige login)
--   wild_ranking_compute               → agregação SEM cache; só wild_ranking (definer) chama
--   fn_register_news_view              → visitante só gerava requisição inútil (função ignorava
--                                        auth.uid() nulo); inicio.js agora só chama logado
--   gatilhos (generate_raffle_numbers, guard_* x3, store_reservation_after_update)
--                                      → gatilho não precisa de EXECUTE do chamador
--
-- CONTINUAM ABERTAS (de propósito):
--   email_unsub_info / email_unsub_apply → descadastro por link, sem login (token de 122 bits)
--   get_share_collection(token)          → link público de fichário compartilhado (token)
--   wild_ranking(period)                 → ranking da Início, com cache de 10 min
--   is_staff_for / is_auction_super_admin → usadas dentro de ~36 policies (anon avaliando
--                                        policy precisa de EXECUTE); só devolvem booleano
--
-- Efeito colateral aceito: visitante que tentar LER auction_orders/auction_order_items
-- agora recebe "permission denied for function" em vez de lista vazia (já era assim
-- em auctions/auction_rounds por causa de is_auction_admin). O site nunca faz isso.
--
-- DESFAZER uma função:  grant execute on function public.<nome>(<args>) to anon, public;
-- Idempotente.
-- ================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'auction_order_buyer_id', 'auction_order_has_item_by_creator', 'has_accepted_seller_terms',
         'expire_store_reservations', 'fn_news_view_counts', 'get_raffle_number_counts',
         'wild_ranking_compute', 'fn_register_news_view',
         'generate_raffle_numbers', 'guard_ml_search_terms_staff_update',
         'guard_positive_companies_staff_update', 'guard_trusted_stores_staff_update',
         'store_reservation_after_update')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;
