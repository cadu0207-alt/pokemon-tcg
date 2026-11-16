-- ================================================================
-- MyDeck — HISTÓRICO DE PREÇOS EM CAMADAS (retenção) · Update 13
--
-- Problema: o cron roda de hora em hora (ml-refresh-all-job, ver
-- lojas_ml_update7.sql) — em poucos meses ml_price_history vira uma
-- tabela enorme, cheia de linhas quase idênticas (mesmo preço, hora
-- diferente), sem ganho real de precisão pro "menor/mediana/média".
--
-- Solução: comprimir o histórico em 3 camadas, do mais recente
-- (granular) pro mais antigo (resumido):
--
--   1. 'raw'   → como já é hoje: 1 linha por rodada do cron (de hora
--                em hora), só pro dia de HOJE (ainda em andamento).
--   2. 'day'   → 1 linha por dia, com o MENOR preço visto naquele dia.
--                Mantido pelos últimos 30 dias.
--   3. 'week'  → 1 linha por semana, com o MENOR preço da semana.
--                Mantido pelas últimas 30 semanas (depois dos 30 dias).
--   4. 'month' → 1 linha por mês, com a MÉDIA de preço do mês.
--                Mantido pra sempre (sem limite) — é só o resumo dos
--                meses mais antigos que isso.
--
-- Resultado: no máximo ~60 preços "granulares" (30 dias + 30 semanas)
-- por produto, mais médias mensais dos meses anteriores a isso — exatamente
-- o esquema pedido. A rolagem entre camadas roda 1x por dia via pg_cron,
-- sempre pegando o que "venceu" o prazo da camada anterior.
--
-- Pré-requisito: pg_cron e pg_net já habilitados (ver lojas_ml_update7.sql).
-- Rode este arquivo inteiro UMA VEZ no SQL Editor do Supabase.
-- ================================================================

-- Passo 1: nova coluna de granularidade + data do "balde" (bucket) pra
-- linhas resumidas (day/week/month). Linhas 'raw' não usam bucket_start.
ALTER TABLE ml_price_history
  ADD COLUMN IF NOT EXISTS granularity TEXT NOT NULL DEFAULT 'raw'
    CHECK (granularity IN ('raw', 'day', 'week', 'month')),
  ADD COLUMN IF NOT EXISTS bucket_start DATE;

CREATE INDEX IF NOT EXISTS idx_ml_price_history_term_gran_bucket
  ON ml_price_history (term_id, granularity, bucket_start);

-- Passo 2: função que faz a rolagem (chamada 1x por dia pelo cron).
-- Cada bloco (dia→semana→mês) roda em sequência na MESMA chamada, então
-- histórico bem antigo (ex: dados de meses atrás que ainda estão como
-- 'raw' na primeira execução) cai direto pra camada certa de uma vez,
-- sem precisar de várias rodadas.
CREATE OR REPLACE FUNCTION ml_rollup_price_history()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_day  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - 30;
  cutoff_week DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - (30 * 7);
BEGIN
  -- ── A) 'raw' de dias já FECHADOS (antes de hoje) → 1 linha 'day' (menor preço) ──
  INSERT INTO ml_price_history
    (term_id, ml_item_id, title, price, currency, url, thumbnail, seller, found_at, granularity, bucket_start)
  SELECT
    term_id,
    (array_agg(ml_item_id ORDER BY price ASC))[1],
    (array_agg(title ORDER BY price ASC))[1],
    MIN(price),
    (array_agg(currency ORDER BY price ASC))[1],
    (array_agg(url ORDER BY price ASC))[1],
    (array_agg(thumbnail ORDER BY price ASC))[1],
    (array_agg(seller ORDER BY price ASC))[1],
    MAX(found_at),
    'day',
    (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE
  FROM ml_price_history
  WHERE granularity = 'raw'
    AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
  GROUP BY term_id, (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE;

  DELETE FROM ml_price_history
  WHERE granularity = 'raw'
    AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  -- ── B) 'day' com mais de 30 dias → 1 linha 'week' (menor preço da semana) ──
  INSERT INTO ml_price_history
    (term_id, ml_item_id, title, price, currency, url, thumbnail, seller, found_at, granularity, bucket_start)
  SELECT
    term_id,
    (array_agg(ml_item_id ORDER BY price ASC))[1],
    (array_agg(title ORDER BY price ASC))[1],
    MIN(price),
    (array_agg(currency ORDER BY price ASC))[1],
    (array_agg(url ORDER BY price ASC))[1],
    (array_agg(thumbnail ORDER BY price ASC))[1],
    (array_agg(seller ORDER BY price ASC))[1],
    MAX(found_at),
    'week',
    date_trunc('week', bucket_start)::DATE
  FROM ml_price_history
  WHERE granularity = 'day'
    AND bucket_start < cutoff_day
  GROUP BY term_id, date_trunc('week', bucket_start)::DATE;

  DELETE FROM ml_price_history
  WHERE granularity = 'day'
    AND bucket_start < cutoff_day;

  -- ── C) 'week' com mais de 30 semanas → 1 linha 'month' (MÉDIA do mês) ──
  INSERT INTO ml_price_history
    (term_id, ml_item_id, title, price, currency, url, thumbnail, seller, found_at, granularity, bucket_start)
  SELECT
    term_id,
    (array_agg(ml_item_id ORDER BY found_at DESC))[1],
    (array_agg(title ORDER BY found_at DESC))[1],
    AVG(price),
    (array_agg(currency ORDER BY found_at DESC))[1],
    (array_agg(url ORDER BY found_at DESC))[1],
    (array_agg(thumbnail ORDER BY found_at DESC))[1],
    (array_agg(seller ORDER BY found_at DESC))[1],
    MAX(found_at),
    'month',
    date_trunc('month', bucket_start)::DATE
  FROM ml_price_history
  WHERE granularity = 'week'
    AND bucket_start < cutoff_week
  GROUP BY term_id, date_trunc('month', bucket_start)::DATE;

  DELETE FROM ml_price_history
  WHERE granularity = 'week'
    AND bucket_start < cutoff_week;
END;
$$;

-- Passo 3: agenda a rolagem pra rodar 1x por dia, de madrugada (03:10,
-- depois que o dia anterior já fechou de vez e antes do 1º refresh do dia).
DO $$
BEGIN
  PERFORM cron.unschedule('ml-rollup-daily-job');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não existia, tudo bem
END $$;

SELECT cron.schedule(
  'ml-rollup-daily-job',
  '10 3 * * *',
  $$SELECT ml_rollup_price_history();$$
);

-- Pra rodar manualmente uma vez agora (ex: pra já comprimir o histórico
-- existente sem esperar até 03:10), descomente e rode:
-- SELECT ml_rollup_price_history();

-- Pra conferir o job agendado:
-- SELECT * FROM cron.job WHERE jobname = 'ml-rollup-daily-job';

-- Pra ver quantas linhas existem por camada (deve convergir pra no
-- máximo ~30 'day' + ~30 'week' por produto, mais 'month' crescendo devagar):
-- SELECT granularity, count(*) FROM ml_price_history GROUP BY granularity;

-- Pra remover o agendamento no futuro, se precisar:
-- SELECT cron.unschedule('ml-rollup-daily-job');
