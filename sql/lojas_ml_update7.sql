-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 7
-- Automação: atualizar preços de todos os produtos rastreados
-- automaticamente, de tempos em tempos, sem precisar clicar em nada.
--
-- Pré-requisito: já ter feito o deploy da Edge Function ml-refresh-all
--   supabase functions deploy ml-refresh-all --no-verify-jwt
--
-- Passo 1: habilitar as extensões necessárias (pg_cron agenda, pg_net
-- faz a chamada HTTP de dentro do Postgres). No Supabase Dashboard:
-- Database → Extensions → procure "pg_cron" e "pg_net" → habilite os 2.
-- (Ou rode os comandos abaixo no SQL Editor.)
-- ================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Passo 2: agenda o job. Já preenchido com o project ref e a anon key
-- que o site usa (mesmos valores de SUPABASE_URL/SUPABASE_KEY em
-- app.js/lojas.js) — não precisa trocar nada, só rodar.
--
-- '0 * * * *' = roda de hora em hora (no minuto 0 de cada hora, 24x/dia).
-- Bom equilíbrio: mantém a vitrine bem atual sem exagerar no volume de
-- linhas em ml_price_history nem na frequência de chamadas à API do ML.

select cron.schedule(
  'ml-refresh-all-job',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/ml-refresh-all',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3',
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Pra conferir se o job foi criado:
-- select * from cron.job;

-- Pra ver o histórico de execuções (sucesso/erro) depois de um tempo:
-- select * from cron.job_run_details order by start_time desc limit 20;

-- Pra remover o agendamento no futuro, se precisar:
-- select cron.unschedule('ml-refresh-all-job');
