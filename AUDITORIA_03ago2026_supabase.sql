-- ════════════════════════════════════════════════════════════════
-- AUDITORIA 03/08/2026 — SQLs para rodar no Supabase (SQL Editor)
-- Rodar na ordem. Cada bloco é independente e idempotente onde possível.
-- ════════════════════════════════════════════════════════════════

-- ── 1. LIMPEZA: registro de teste da auditoria ───────────────────
-- A auditoria gravou uma compra de R$ -50 pra provar o bug de validação
-- (e o bug de não existir excluir compra impediu a remoção pela UI).
DELETE FROM purchases WHERE product = 'TESTE-AUDITORIA apagar';

-- ── 2. BLINDAGEM: constraints de sanidade em purchases ───────────
-- A UI agora valida (app.js), mas constraint no banco protege contra
-- qualquer cliente/bug futuro — vale pra TODOS os 70+ usuários.
-- (Rodar DEPOIS do bloco 1, senão o registro de -50 invalida o ALTER.)
ALTER TABLE purchases
  ADD CONSTRAINT purchases_price_positive CHECK (price > 0);
ALTER TABLE purchases
  ADD CONSTRAINT purchases_boost_sane CHECK (boost >= 0 AND boost <= 2000);

-- Preço de carta tirada nunca negativo (0 é permitido — carta sem valor):
ALTER TABLE pulled_cards
  ADD CONSTRAINT pulled_cards_price_nonneg CHECK (price >= 0);

-- Se algum ALTER falhar com "constraint already exists", pode ignorar.
-- Se falhar com violação, liste os registros inválidos antes:
--   SELECT id, user_id, product, price FROM purchases WHERE price <= 0;

-- ── 3. DIAGNÓSTICO: RPC fn_xp_achievement_progress retorna 400 ───
-- O site chama sbClient.rpc('fn_xp_achievement_progress', {p_user_id: ...})
-- e recebe HTTP 400 em todo load (falha silenciosa do progresso de
-- conquistas). 400 em RPC = assinatura não bate (nome/tipo do argumento)
-- ou função não existe. Descubra a assinatura real:
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'fn_xp%';

-- → Se a função não aparecer: ela foi dropada — recriar.
-- → Se o argumento tiver outro nome (ex.: "uid" em vez de "p_user_id"):
--   ou renomeie no xp_system.js (linha ~202), ou recrie a função com
--   o parâmetro chamado p_user_id (PostgREST casa por NOME do argumento).
-- → Se o tipo for diferente (ex.: text vs uuid), ajuste o tipo.

-- ── 4. DIAGNÓSTICO: ranking retorna 503 ──────────────────────────
-- O HEAD em user_progress?total_xp=gt.X respondeu 503 (Service Unavailable)
-- durante a auditoria. 503 no PostgREST costuma ser pool de conexões
-- esgotado ou instância pausada/sobrecarregada no plano free.
-- Verifique em: Dashboard Supabase → Reports → API / Database.
-- Se for recorrente, o xp_system.js pode cachear a posição do ranking por
-- sessão em vez de consultar a cada load.
