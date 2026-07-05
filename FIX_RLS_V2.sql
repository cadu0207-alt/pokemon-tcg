-- ============================================================
-- MyDeck — FIX RLS v2: fecha um buraco de segurança real
-- Rodar no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- ============================================================
--
-- O QUE ACONTECEU:
-- supabase_setup.sql (script original) criou policies chamadas
-- "public read purchases", "public insert purchases", "public delete purchases"
-- (e o mesmo pra pulled_cards e collection) com `using (true)` / `with check (true)`
-- — ou seja, QUALQUER usuário logado (ou até anônimo, dependendo da config)
-- conseguia ler, inserir e apagar dados de QUALQUER outro usuário nessas 3 tabelas.
--
-- SETUP_AUTH.sql e FIX_RLS.sql, rodados depois, criaram policies novas e corretas
-- ("own_purchases", "own_pulled_cards", "own_collection", restritas a auth.uid()),
-- mas NUNCA apagaram as policies antigas "public ..." — e no Postgres, quando
-- existem várias policies permissivas pra mesma tabela/comando, elas se somam
-- (OR), então a policy antiga aberta CONTINUA valendo por baixo da nova.
-- Se ninguém rodou um DROP POLICY manual com esses nomes exatos em algum momento,
-- isso ainda está bloqueado igual hoje (04/07/2026).
--
-- Este script derruba especificamente as policies antigas, deixando só as
-- restritas por usuário. É seguro rodar mesmo que elas já tenham sido removidas
-- (DROP POLICY IF EXISTS não dá erro se não existir).

DROP POLICY IF EXISTS "public read purchases"   ON purchases;
DROP POLICY IF EXISTS "public insert purchases" ON purchases;
DROP POLICY IF EXISTS "public delete purchases" ON purchases;

DROP POLICY IF EXISTS "public read pulled"   ON pulled_cards;
DROP POLICY IF EXISTS "public insert pulled" ON pulled_cards;
DROP POLICY IF EXISTS "public delete pulled" ON pulled_cards;

DROP POLICY IF EXISTS "public read collection"   ON collection;
DROP POLICY IF EXISTS "public insert collection" ON collection;
DROP POLICY IF EXISTS "public delete collection" ON collection;

-- Garante que as policies corretas existem (idempotente — recria se preciso)
DROP POLICY IF EXISTS "own_purchases"    ON purchases;
DROP POLICY IF EXISTS "own_pulled_cards" ON pulled_cards;
DROP POLICY IF EXISTS "own_collection"   ON collection;

CREATE POLICY "own_purchases"    ON purchases    FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_pulled_cards" ON pulled_cards FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_collection"   ON collection   FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Rode esta consulta depois e confira se SÓ aparecem as policies "own_*"
-- (nenhuma "public ..." deve sobrar na lista):
--
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('purchases','pulled_cards','collection')
-- order by tablename, policyname;

-- ── ÍNDICES (performance) ────────────────────────────────────
-- purchases e pulled_cards não tinham índice em user_id — toda leitura
-- fazia varredura completa da tabela. Baixo impacto com poucos dados,
-- mas de graça e sem risco:
CREATE INDEX IF NOT EXISTS purchases_user_idx    ON purchases (user_id);
CREATE INDEX IF NOT EXISTS pulled_cards_user_idx ON pulled_cards (user_id);
