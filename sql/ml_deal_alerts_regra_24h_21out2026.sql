-- 21/10/2026 — Regra do Eduardo para o aviso de promoção (ml_check_deals): preço parado por mais de 24 h NÃO é promoção
-- (o produto não tem saída); só volta a ser promoção se o preço baixar. Já aplicado em produção (migration ml_deal_alerts_regra_24h_escopo).
--   • só avalia produto com QUEDA nas últimas 24 h (maior preço visto em 24 h > preço de agora);
--   • sem aviso repetido por tempo: só avisa de novo se o preço cair mais 5% abaixo do último avisado (ou nova queda após 24 h);
--   • o texto do aviso passa a dizer "caiu de R$ X";
--   • escopo (app_private_config.deal_scope): 'all' = todas as promoções · 'marked' = só ml_search_terms.deal_watch = true
--     (RPCs ml_get_deal_scope / ml_set_deal_scope, só o admin; botões no painel admin da aba de promoções).
--   • as 35 "travas" de 20/10 (ml_deal_alerts com sent_at no futuro) foram removidas: a regra nova já evita a enxurrada.
-- Antes da mudança: 184 notificações de promoção em 24 h (6 produtos × 4 destinatários, reavisando a cada 24 h/queda de 5%).
alter table public.ml_search_terms add column if not exists deal_watch boolean not null default false;
