-- ================================================================
-- MyDeck — CORREÇÃO DE OUTLIER NO HISTÓRICO DE PREÇOS · Update 14
--
-- Bug encontrado: em 21/jul o robô (cron de hora em hora) registrou
-- um preço de R$159 pro "Box Pokémon Mega Emboar EX" (term_id 34) —
-- todos os outros horários daquele dia, e os dias antes/depois,
-- mostraram R$210. Mesmo padrão em "Box First Partner Illustration
-- Collection — Série 1 (Inglês)" (term_id 43): R$339 isolado em
-- 20/jul, cercado de R$469,90.
--
-- Causa raiz: a rotina de compactação diária (ml_rollup_price_history,
-- ver lojas_ml_update13.sql) salva o MENOR preço bruto do dia como
-- resumo e IMEDIATAMENTE apaga os dados brutos da hora. Sem nenhum
-- filtro, uma leitura ruim isolada (cupom momentâneo, erro de parsing,
-- item errado casado na busca do ML) vira "recorde histórico mais
-- baixo" pra sempre — e é exatamente o que gera o "menor preço já
-- registrado" errado que aparece na home do site.
--
-- Varredura completa (1202 linhas, todas as granularidades e produtos)
-- confirmou que são só esses 2 casos isolados — não é um bug
-- sistêmico generalizado, mas pode voltar a acontecer.
--
-- Este script faz duas coisas:
--   1. Corrige os 2 registros já corrompidos.
--   2. Blinda ml_rollup_price_history() contra o mesmo problema no
--      futuro: ao compactar 'raw' → 'day', ignora leituras abaixo de
--      70% da MEDIANA do dia antes de calcular o menor preço. Uma
--      leitura isolada e muito abaixo do resto não passa a compor o
--      "menor preço do dia"; uma queda real (promoção genuína, cai o
--      preço em várias leituras do dia) continua sendo capturada
--      normalmente, porque a mediana desce junto.
--
-- Rode este arquivo inteiro UMA VEZ no SQL Editor do Supabase.
-- ================================================================

-- Passo 1: corrige os 2 registros já corrompidos (ajusta pro valor
-- real observado nos horários vizinhos daquele mesmo dia).
UPDATE ml_price_history SET price = 210    WHERE id = 6368; -- Emboar, 21/jul
UPDATE ml_price_history SET price = 469.90 WHERE id = 5377; -- First Partner Série 1 (EN), 20/jul

-- Passo 2: substitui a função de rollup por uma versão com filtro
-- anti-outlier no passo 'raw' → 'day'. Os passos 'day' → 'week' e
-- 'week' → 'month' continuam idênticos ao update13 (eles já operam
-- sobre dados que passaram pelo filtro, então herdam a proteção).
CREATE OR REPLACE FUNCTION ml_rollup_price_history()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_day  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - 30;
  cutoff_week DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE - (30 * 7);
BEGIN
  -- ── A) 'raw' de dias já FECHADOS → 1 linha 'day' (menor preço "confiável" do dia) ──
  -- Anti-outlier: descarta leituras abaixo de 70% da MEDIANA do dia
  -- antes de pegar o MIN. Uma leitura isolada e muito baixa (glitch)
  -- não entra na conta; uma queda real e sustentada (várias leituras
  -- baixas no dia) arrasta a mediana junto e continua sendo pega.
  WITH raw_closed AS (
    SELECT *,
      (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE AS day
    FROM ml_price_history
    WHERE granularity = 'raw'
      AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
  ),
  with_median AS (
    SELECT *,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) OVER (PARTITION BY term_id, day) AS day_median
    FROM raw_closed
  ),
  filtered AS (
    SELECT * FROM with_median
    WHERE price >= day_median * 0.7
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
    AND (found_at AT TIME ZONE 'America/Sao_Paulo')::DATE < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  -- ── B) 'day' com mais de 30 dias → 1 linha 'week' (menor preço da semana) ── (igual ao update13)
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

  -- ── C) 'week' com mais de 30 semanas → 1 linha 'month' (MÉDIA do mês) ── (igual ao update13)
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

-- Passo 3: conferir se os 2 registros ficaram corrigidos:
-- SELECT id, term_id, price, bucket_start FROM ml_price_history WHERE id IN (6368, 5377);

-- Passo 4: o cron 'ml-rollup-daily-job' já existe (agendado no update13)
-- e passa a usar esta versão nova da função automaticamente — não
-- precisa reagendar nada.
