-- ================================================================
-- MyDeck — COTAÇÃO DE FRETE (SuperFrete) — 31/08/2026
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
--
-- O QUE ISSO FAZ:
-- Adiciona só o mínimo pra permitir cotar frete automático (SuperFrete)
-- em cima do que já existe. NÃO cria tabela de endereço nova — reaproveita
-- 100% `user_addresses` (leilão/rifa, endereço do comprador) e
-- `trusted_stores` (marketplace, endereço da loja), que já têm CEP.
--
-- Decisão (Eduardo, 31/ago/2026):
--   • CEP de origem = o mesmo endereço que cada vendedor (leiloeiro,
--     rifeiro, loja) já preenche pra outras coisas — sem cadastro novo,
--     só passa a ser EXIGIDO antes da primeira venda/cadastro dele.
--   • Peso/dimensão = tabela fixa por "tipo de pacote" (ver frete.js),
--     não por carta/produto individual — carta avulsa (150g), quadripack,
--     ETB, display box. Ajustável depois se os valores reais divergirem
--     muito do que o SuperFrete cobrar de verdade.
-- ================================================================

-- ── 1. Tipo de pacote por carta em leilão ──────────────────────────
-- Cada linha de `auctions` é UMA carta; a esmagadora maioria vai ser
-- 'avulsa' (protegida em toploader + envelope). As poucas exceções
-- (leiloeiro vendendo um produto lacrado dentro de uma rodada) usam os
-- outros tipos — ver PACKAGE_TYPES em frete.js pro peso/dimensão de cada um.
alter table auctions
  add column if not exists package_type text not null default 'avulsa'
  check (package_type in ('avulsa','quadripack','etb','displaybox'));

-- ── 2. Tipo de pacote por rifa ──────────────────────────────────────
-- Uma rifa também é normalmente "avulsa" (uma carta), mas pode ser um
-- produto lacrado sorteado.
alter table raffles
  add column if not exists package_type text not null default 'avulsa'
  check (package_type in ('avulsa','quadripack','etb','displaybox'));

-- ── 3. Cache simples de cotação (evita bater na API do SuperFrete
--      de novo pro mesmo par origem/destino/pacote em poucos minutos) ─
create table if not exists freight_quote_cache (
  id            bigint generated always as identity primary key,
  cache_key     text not null unique,   -- ex: 'auction_round:12:60000000:avulsa:1'
  quotes        jsonb not null,         -- resposta já pronta pro front (array de {service,price,dias})
  created_at    timestamptz not null default now()
);
alter table freight_quote_cache enable row level security;
-- Só a Edge Function (service_role) lê/escreve aqui — front nunca acessa direto.
drop policy if exists "freight_quote_cache_no_client_access" on freight_quote_cache;
create policy "freight_quote_cache_no_client_access" on freight_quote_cache
  for all using (false) with check (false);

-- Índice pra limpar cache velho de vez em quando (opcional, rodar manual
-- ou criar um cron depois se a tabela crescer demais):
--   delete from freight_quote_cache where created_at < now() - interval '2 hours';
create index if not exists freight_quote_cache_created_at_idx on freight_quote_cache(created_at);
