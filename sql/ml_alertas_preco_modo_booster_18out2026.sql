-- 18/10/2026 — Alertas de preço: modo "por booster" (alvo = preço do produto ÷ nº de boosters).
-- Já aplicado em produção (migration ml_alertas_preco_modo_booster). Só funciona em produtos com ml_search_terms.boosters.
-- Mudanças: coluna mode ('price'|'booster'), ml_set_price_alert(p_term, p_target, p_mode) e ml_check_price_alerts() compara o valor certo.
-- (As definições completas das funções ficam na migration; este arquivo registra a mudança de esquema.)
alter table public.ml_price_alerts add column if not exists mode text not null default 'price' check (mode in ('price','booster'));
