-- ================================================================
-- MyDeck — OTIMIZAÇÃO DO BANCO (03/10/2026) — achados da auditoria #2
--
-- 1. ml_price_history: a consulta do app (term_id = X, order by found_at desc,
--    limit 500) levava ~4 s por não ter índice em found_at → 45 respostas 500 e
--    87 "statement timeout" em 24 h. Índice (term_id, found_at desc) resolve.
-- 2. Funções minhas com search_path mutável (advisor): fixa em public.
-- 3. Políticas de notifications / notification_prefs: auth.uid() reavaliado por
--    linha → (select auth.uid()) (avaliado uma vez por consulta).
-- 4. Índices que faltavam nas chaves estrangeiras das tabelas novas.
-- 5. Funções SECURITY DEFINER que só fazem sentido logado: tira o EXECUTE de
--    PUBLIC/anon (authenticated e service_role continuam). Todas já checavam
--    auth.uid()/dono por dentro — anon só recebia erro; agora nem chega lá.
--    FICAM abertas (de propósito): funções usadas dentro de policies (is_staff_for,
--    is_auction_super_admin, auction_order_*, has_accepted_seller_terms), as
--    públicas (wild_ranking, get_share_collection, fn_news_view_counts,
--    fn_register_news_view, get_raffle_number_counts, expire_store_reservations,
--    email_unsub_*) e as funções de gatilho.
--
-- DESFAZER o item 5 de uma função:
--   grant execute on function public.<nome>(<args>) to anon, public;
-- Idempotente.
-- ================================================================

-- 1. índice de histórico de preço do Mercado Livre
create index if not exists idx_ml_price_history_term_found_at
  on ml_price_history (term_id, found_at desc);
analyze ml_price_history;

-- 2. search_path fixo
alter function push_broadcast_types() set search_path = public;
alter function push_broadcast_bucket(text) set search_path = public;
alter function email_unsub_mask(text) set search_path = public;

-- 3. políticas com (select auth.uid())
drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_delete_own" on notifications
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "notification_prefs_select_own" on notification_prefs;
create policy "notification_prefs_select_own" on notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notification_prefs_insert_own" on notification_prefs;
create policy "notification_prefs_insert_own" on notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "notification_prefs_update_own" on notification_prefs;
create policy "notification_prefs_update_own" on notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 4. índices de chave estrangeira
create index if not exists notifications_auction_id_idx on notifications (auction_id) where auction_id is not null;
create index if not exists lot_emails_user_id_idx on lot_emails (user_id);

-- 5. só logado executa
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'add_staff_member', 'remove_staff_member', 'set_staff_permissions', 'get_my_staff_access',
         'is_staff_member', 'is_auction_viewer',
         'admin_add_manual_raffle_payment', 'admin_assign_numbers_to_payment', 'archive_raffle_without_draw',
         'cancel_raffle_draw_schedule', 'claim_raffle_numbers', 'confirm_raffle_payment', 'draw_raffle',
         'reject_raffle_payment', 'schedule_raffle_draw', 'get_raffle_tracking_overview',
         'auction_orders_monthly_total', 'auction_round_recent_bids_admin', 'store_reservations_monthly_total',
         'cancel_store_reservation', 'reserve_store_item',
         'battle_random_opponent', 'catch_wild_pokemon', 'release_wild_pokemon', 'rename_wild_pokemon', 'set_wild_loadout',
         'set_display_name')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;
