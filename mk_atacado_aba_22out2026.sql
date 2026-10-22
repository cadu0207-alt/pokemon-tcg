-- 22/10/2026 — Aba "Atacado" na página da loja Toybox no MyDeck (já aplicado em produção; migration mk_sellers_atacado_aba).
-- mk_sellers.wholesale_info: texto (Markdown simples) da aba; vazio = sem aba. mk_sellers.wholesale_url: link https do catálogo de importação (opcional).
-- O lojista edita no painel (Dados da loja → Aba "Atacado"). A Toybox foi preenchida com o texto "Tipos de distribuição" enviado pelo Alex
-- (Estoque: mínimo R$ 2.000, FOB; Importação: mínimo R$ 3.000, 15 dias, 100% antecipado).
alter table public.mk_sellers add column if not exists wholesale_info text check (wholesale_info is null or char_length(wholesale_info) <= 8000);
alter table public.mk_sellers add column if not exists wholesale_url text check (wholesale_url is null or (char_length(wholesale_url) <= 500 and wholesale_url ~* '^https://'));
