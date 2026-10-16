-- 17/10/2026 — Loja Toybox: a política de trocas colada pelo lojista (Markdown longo) era cortada em 2000 caracteres
-- (check no banco + maxlength no painel). Sobe o limite da política para 8000; a descrição continua em 2000.
-- Só amplia o limite: nenhum dado existente muda. Já aplicado em produção via migration mk_return_policy_limite_8000.
alter table public.mk_sellers drop constraint if exists mk_sellers_return_policy_check;
alter table public.mk_sellers add constraint mk_sellers_return_policy_check check (return_policy is null or char_length(return_policy) <= 8000);
