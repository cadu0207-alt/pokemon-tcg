-- ml_price_history: conserta a política de retenção (03/10/2026)
--
-- SINTOMA: a tabela tinha 327 mil linhas 'raw' (116 MB, ~2 MB/dia) desde 22/07 e nenhuma linha 'day' nova.
-- CAUSA: o cron 'ml-rollup-daily-job' (03:10 UTC) FALHA todo dia desde o lojas_ml_update14.sql:
--   "OVER is not supported for ordered-set aggregate percentile_cont"
-- O filtro anti-outlier do update14 usava PERCENTILE_CONT(...) WITHIN GROUP (...) OVER (PARTITION BY ...),
-- que o Postgres não aceita (agregado de conjunto ordenado não aceita janela). Como a função roda numa
-- transação só, o erro desfazia tudo e o 'raw' nunca era compactado.
--
-- CORREÇÃO: a mediana por (term_id, dia) passa a ser calculada num GROUP BY e juntada às leituras.
-- A regra de negócio é a mesma do update14 (descarta leitura < 70% da mediana do dia, depois pega o MIN).
-- Melhoria junto: as camadas week/month só viram resumo quando o período está COMPLETO
-- (corte alinhado ao início da semana / do mês) — antes um corte no meio da semana gerava duas linhas
-- 'week' para a mesma semana.
--
-- Política resultante (por produto): 'raw' (a cada 15 min) só no dia corrente → 'day' por 30 dias →
-- 'week' (menor preço da semana) até 30 semanas → 'month' (média do mês) para sempre.
-- Estado estacionário: ~1 linha/dia + semanas/meses ≈ poucas centenas de KB por ano em vez de ~700 MB/ano.

CREATE OR REPLACE FUNCTION ml_rollup_price_history()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  hoje        DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  cutoff_day  DATE := date_trunc('week',  (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - 30)::DATE;
  cutoff_week DATE := date_trunc('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - (30 * 7))::DATE;
BEGIN
  -- ── A) 'raw' de dias já FECHADOS → 1 linha 'day' (menor preço "confiável" do dia) ──
  WITH raw_closed AS (
    SELECT *, (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE AS day
    FROM ml_price_history
    WHERE granularity = 'raw'
      AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < hoje
  ),
  medians AS (
    SELECT term_id, day, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS day_median
    FROM raw_closed
    GROUP BY term_id, day
  ),
  filtered AS (
    SELECT r.* FROM raw_closed r
    JOIN medians m ON m.term_id = r.term_id AND m.day = r.day
    WHERE r.price >= m.day_median * 0.7
  )
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
    day
  FROM filtered
  GROUP BY term_id, day;

  DELETE FROM ml_price_history
  WHERE granularity = 'raw'
    AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < hoje;

  -- ── B) 'day' de semanas completas com mais de ~30 dias → 1 linha 'week' (menor preço da semana) ──
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

  -- ── C) 'week' de meses completos com mais de ~30 semanas → 1 linha 'month' (MÉDIA do mês) ──
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
$function$;

-- Só o cron (postgres) e o service_role precisam executar; nada de anon/authenticated.
REVOKE ALL ON FUNCTION ml_rollup_price_history() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION ml_rollup_price_history() TO service_role;

-- Depois de rodar a 1ª vez (compacta o acumulado): VACUUM FULL ml_price_history; para devolver o espaço ao disco.
