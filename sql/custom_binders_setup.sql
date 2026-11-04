-- ═══════════════════════════════════════════════════════════════
-- FICHÁRIOS PERSONALIZADOS — MyDeck Pokémon TCG
-- Rodar no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_binders (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text        NOT NULL,
  emoji         text        DEFAULT '📚',
  layout        smallint    DEFAULT 3,           -- 2, 3 ou 4 colunas
  filter_config jsonb       DEFAULT '{}',        -- {"type":"preset","key":"ilustr_esp_rara"} ou {"type":"manual"}
  card_ids      jsonb       DEFAULT '[]',        -- [{set:'me04',n:'001'},...] — só para manual
  cover_color   text        DEFAULT '#a855f7',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE custom_binders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_binders_own" ON custom_binders;
CREATE POLICY "custom_binders_own" ON custom_binders
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Índice para buscas por usuário
CREATE INDEX IF NOT EXISTS custom_binders_user_idx ON custom_binders (user_id);
