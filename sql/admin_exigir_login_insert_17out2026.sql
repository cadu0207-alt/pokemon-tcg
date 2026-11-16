-- Segurança (17/10/2026): INSERT público (inclusive anônimo) em tabelas de recursos aposentados que o painel Admin lista.
-- Passa a exigir login (papel authenticated). As condições (with_check) das políticas continuam as mesmas.
-- Aplicado em produção como migração `admin_exigir_login_insert_17out2026`.
alter policy trusted_stores_insert_pending on public.trusted_stores to authenticated;
alter policy positive_companies_insert on public.positive_companies to authenticated;
alter policy company_reviews_insert on public.company_reviews to authenticated;
