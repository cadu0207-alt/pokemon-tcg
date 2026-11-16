-- ================================================================
-- MyDeck — HISTÓRICO DE PREÇO POR CARTA · Tabela card_price_history
-- Rodar no SQL Editor do Supabase
--
-- Um snapshot por dia do preço de CADA slot (carta+versão) do catálogo
-- inteiro — não é por usuário, é o preço "de tabela" (o mesmo que já
-- aparece no Fichário/Preço Justo), gravado uma vez ao dia por
-- scripts/snapshot_card_prices.js via GitHub Actions (mesmo padrão de
-- value_history_setup.sql).
--
-- slot_key segue o mesmo formato usado em `collection`/`card_listings`/
-- `buy_orders`: "<setId>:<n>:<versao>"  ex: "me04:001:N"
--
-- Como o dado não é sensível (é preço público de catálogo, igual ao que
-- já aparece pra qualquer visitante do site), SELECT é público pra
-- qualquer usuário autenticado — diferente de value_history (que é
-- privado por ser o patrimônio de cada um). INSERT/UPDATE só pela
-- service role key (cron) — não há policy de escrita pro client.
-- ================================================================

CREATE TABLE IF NOT EXISTS card_price_history (
  slot_key    text        NOT NULL,
  set_id      text        NOT NULL,
  card_n      text        NOT NULL,
  version     text        NOT NULL,
  card_name   text,
  price       numeric     NOT NULL,
  date        date        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (slot_key, date)
);

ALTER TABLE card_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_price_history_select_all" ON card_price_history;
CREATE POLICY "card_price_history_select_all" ON card_price_history
  FOR SELECT
  USING (true);

-- Índices: leitura por slot (gráfico de uma carta) e por data (auditoria/limpeza)
CREATE INDEX IF NOT EXISTS card_price_history_slot_date_idx ON card_price_history (slot_key, date);
CREATE INDEX IF NOT EXISTS card_price_history_date_idx ON card_price_history (date);

-- Pra conferir depois de rodar:
-- select * from card_price_history where slot_key = 'me04:001:N' order by date desc limit 30;
