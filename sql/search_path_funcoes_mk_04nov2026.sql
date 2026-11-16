-- 04/11/2026 — Aviso do Supabase (advisor "function_search_path_mutable"):
-- 5 funcoes do marketplace sem search_path fixo. Todas sao SECURITY INVOKER, pequenas e
-- nao tocam em tabelas nem em outros schemas; fixar o search_path nao muda o comportamento,
-- so impede que um schema ou objeto homonimo altere o que elas resolvem.
alter function public.mk_products_guard()      set search_path = public, pg_temp;
alter function public.mk_products_published()  set search_path = public, pg_temp;
alter function public.mk_sellers_guard()       set search_path = public, pg_temp;
alter function public.mk_touch_updated_at()    set search_path = public, pg_temp;
alter function public.mk_valid_cpf(text)       set search_path = public, pg_temp;
