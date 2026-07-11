-- ═══════════════════════════════════════════════════════════════
-- HISTÓRICO DE VALOR DA COLEÇÃO — MyDeck Pokémon TCG
-- Rodar no SQL Editor do Supabase
--
-- Um snapshot por usuário por dia do valor total do fichário (soma dos
-- preços de todos os slots coletados, mesma conta de calcCollectedValue()
-- em app.js). Gravado por scripts/snapshot_value.js via GitHub Actions,
-- usando a service role key — por isso NÃO há policy de INSERT/UPDATE
-- para o usuário: a service role sempre ignora RLS, e usuários comuns só
-- podem LER o próprio histórico (não podem forjar valores).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS value_history (
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date         date        NOT NULL,
  total_value  numeric     NOT NULL,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- RLS
ALTER TABLE value_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "value_history_own_select" ON value_history;
CREATE POLICY "value_history_own_select" ON value_history
  FOR SELECT
  USING (user_id = auth.uid());

-- Índice para a leitura ordenada por data no gráfico do dashboard
CREATE INDEX IF NOT EXISTS value_history_user_date_idx ON value_history (user_id, date);
