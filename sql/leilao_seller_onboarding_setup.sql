-- ================================================================
-- MyDeck — ACEITE OBRIGATÓRIO DO LEILOEIRO (leilao_seller_onboarding_setup.sql)
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- Depois de já ter rodado leilao_setup.sql (usa is_auction_admin()).
--
-- Espelha o mesmo padrão do aceite de regras do COMPRADOR
-- (auction_rules_acceptance, ver leilao_setup.sql seção 5c) — só que pro
-- LEILOEIRO: antes do primeiro cadastro (rodada ou carta), ele precisa ter
-- aceitado a Política de Privacidade, os Termos de Compromisso do
-- Leiloeiro (isenção de responsabilidade do MyDeck) e a tabela de
-- comissões vigente. Fica registrado com data/hora + navegador, e serve
-- de prova de aceite caso precise no futuro.
-- ================================================================

-- Chave composta (user_id, terms_version): se o texto mudar no futuro
-- (bump em AUC_SELLER_TERMS_VERSION no leilao.js), o leiloeiro precisa
-- aceitar de novo — e o aceite antigo NÃO é apagado nem sobrescrito, fica
-- como histórico permanente (insert-only, nunca update).
create table if not exists auction_seller_acceptance (
  user_id              uuid not null references auth.users(id),
  terms_version        text not null,
  privacy_accepted_at  timestamptz not null default now(),
  terms_accepted_at    timestamptz not null default now(),
  fees_accepted_at     timestamptz not null default now(),
  user_agent           text,
  primary key (user_id, terms_version)
);

alter table auction_seller_acceptance enable row level security;

drop policy if exists "auction_seller_acceptance_select" on auction_seller_acceptance;
create policy "auction_seller_acceptance_select" on auction_seller_acceptance
  for select using (user_id = auth.uid() or is_auction_admin());

-- Insert-only de propósito (sem policy de update/delete) — o registro de
-- aceite não pode ser alterado depois de gravado, só um novo aceite (nova
-- versão) pode ser adicionado.
drop policy if exists "auction_seller_acceptance_insert" on auction_seller_acceptance;
create policy "auction_seller_acceptance_insert" on auction_seller_acceptance
  for insert with check (user_id = auth.uid());

-- Função que o resto do banco consulta pra saber se PODE deixar o
-- leiloeiro cadastrar algo. security definer + search_path fixo, mesmo
-- padrão de is_auction_admin().
create or replace function has_accepted_seller_terms(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from auction_seller_acceptance
    where user_id = p_uid and terms_version = 'v1'
  );
$$;

grant execute on function has_accepted_seller_terms(uuid) to authenticated;

-- ── Trava no banco (não só na tela) — quem não aceitou não consegue
-- criar rodada nem publicar carta, mesmo chamando a API direto. Só as
-- policies de INSERT mudam (leiloeiro que já tem itens cadastrados
-- continua editando/cancelando normalmente por is_auction_admin() puro —
-- ver auctions_update_admin/auction_rounds_update_admin, sem alteração).
drop policy if exists "auction_rounds_insert_admin" on auction_rounds;
create policy "auction_rounds_insert_admin" on auction_rounds
  for insert with check (is_auction_admin() and has_accepted_seller_terms());

drop policy if exists "auctions_insert_admin" on auctions;
create policy "auctions_insert_admin" on auctions
  for insert with check (is_auction_admin() and has_accepted_seller_terms());
