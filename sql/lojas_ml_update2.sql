-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 2
-- Rode DEPOIS do lojas_ml_update1.sql (SQL Editor → Run)
--
-- O que muda: as políticas de escrita passam a reconhecer o admin
-- também pelo e-mail cadu0207@gmail.com (além do UUID), cobrindo
-- qualquer variação de login (Google/e-mail) que gere UUIDs diferentes
-- pra mesma pessoa.
-- ================================================================

DROP POLICY IF EXISTS "admin_write_terms" ON ml_search_terms;
CREATE POLICY "admin_write_terms" ON ml_search_terms FOR INSERT
  WITH CHECK (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  );

DROP POLICY IF EXISTS "admin_update_terms" ON ml_search_terms;
CREATE POLICY "admin_update_terms" ON ml_search_terms FOR UPDATE
  USING (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  )
  WITH CHECK (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  );

DROP POLICY IF EXISTS "admin_delete_terms" ON ml_search_terms;
CREATE POLICY "admin_delete_terms" ON ml_search_terms FOR DELETE
  USING (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  );

-- Cupons também passam a reconhecer o admin pelo e-mail
DROP POLICY IF EXISTS "write_coupons" ON ml_coupons;
CREATE POLICY "write_coupons" ON ml_coupons FOR ALL
  USING (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  )
  WITH CHECK (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    OR auth.email() = 'cadu0207@gmail.com'
  );
