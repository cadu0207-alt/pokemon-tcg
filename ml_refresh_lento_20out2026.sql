-- 20/10/2026 — Frequência de atualização de preço por produto (já aplicado em produção; migration ml_refresh_minutes).
-- ml_search_terms.refresh_minutes: 15 (cron geral */15) ou 30 (cron lento ml-refresh-slow-30min: minutos 7 e 37, chama ml-refresh-all?slow=1).
-- Os 63 produtos cadastrados antes de 15/10/2026 ficam em 30; os mais novos (Celebração 30 Anos e a rodada Mega Evolução) em 15.
-- A Celebração 30 Anos continua com o cron próprio de 5 min (?collection=).
-- ml-refresh-all passou a processar 3 produtos por vez (antes 1) — a rodada geral chegou a 135 s, perto do limite de 150 s.
alter table public.ml_search_terms add column if not exists refresh_minutes smallint not null default 15 check (refresh_minutes in (5, 15, 30, 60));
update public.ml_search_terms set refresh_minutes = 30 where active and created_at < '2026-10-15';
-- cron.schedule('ml-refresh-slow-30min', '7,37 * * * *', 'select net.http_post(url := ''https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/ml-refresh-all?slow=1', ...)') — ver o job no banco.
