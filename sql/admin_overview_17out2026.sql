-- Painel Admin: visão geral (pendências, atividade real e saúde do sistema) — só equipe (is_staff_member).
-- Aplicado em produção como migração `admin_overview_17out2026`. Usado por admin_overview.js.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  r := jsonb_build_object(
    'generated_at', now(),
    'usage', jsonb_build_object(
      'total_users',     (select count(*) from auth.users),
      'signups_7d',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'signups_30d',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_1d',       (select count(distinct user_id) from tab_visits where created_at > now() - interval '1 day'),
      'active_7d',       (select count(distinct user_id) from tab_visits where created_at > now() - interval '7 days'),
      'active_30d',      (select count(distinct user_id) from tab_visits where created_at > now() - interval '30 days'),
      'with_collection', (select count(distinct user_id) from collection)
    ),
    'pending', jsonb_build_object(
      'feedback_unanswered',    (select count(*) from feedback_messages where reply is null),
      'auction_overdue_orders', (select count(*) from auction_orders where status = 'aguardando_pagamento' and payment_due_at < now()),
      'auction_overdue_amount', (select coalesce(sum(amount), 0) from auction_orders where status = 'aguardando_pagamento' and payment_due_at < now()),
      'mk_to_ship',             (select count(*) from mk_orders where status in ('pago', 'em_separacao')),
      'mk_waiting_payment',     (select count(*) from mk_orders where status = 'aguardando_pagamento' and (expires_at is null or expires_at > now())),
      'positivo_pending',       (select count(*) from positive_companies where status = 'pendente'),
      'stores_pending',         (select count(*) from trusted_stores where status = 'pendente')
    ),
    'health', jsonb_build_object(
      'ml_last_found_at',  (select max(found_at) from ml_price_history),
      'ml_terms_active',   (select count(*) from ml_search_terms where active),
      'ml_terms_stale',    (select count(*) from ml_search_terms t where t.active and not exists (select 1 from ml_price_history h where h.term_id = t.id and h.found_at > now() - interval '6 hours')),
      'push_subscriptions',(select count(*) from push_subscriptions),
      'push_users',        (select count(distinct user_id) from push_subscriptions),
      'push_queue_pending',(select count(*) from push_broadcast_queue where status = 'pending'),
      'cron', (select coalesce(jsonb_agg(jsonb_build_object(
                  'job', j.jobname, 'schedule', j.schedule, 'active', j.active,
                  'last_run',    (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
                  'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
                  'runs_24h',    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
                  'failures_24h',(select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status <> 'succeeded')
                ) order by j.jobname), '[]'::jsonb) from cron.job j)
    ),
    'minigame', jsonb_build_object(
      'players_today',        (select count(*) from wild_daily where day = v_today),
      'spawns_today',         (select coalesce(sum(spawns), 0) from wild_daily where day = v_today),
      'catch_attempts_today', (select coalesce(sum(catch_attempts), 0) from wild_daily where day = v_today),
      'battles_today',        (select coalesce(sum(battles), 0) from wild_daily where day = v_today),
      'at_cap_today',         (select count(*) from wild_daily where day = v_today and (catch_attempts >= 500 or battles >= 60 or spawns >= 450))
    )
  );
  return r;
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
