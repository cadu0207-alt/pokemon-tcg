-- ================================================================
-- MyDeck — SISTEMA DE VENDAS (lojas confiáveis + endereço + ofertas)
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
--
-- Fase 1 (MVP decidido em jul/2026): o app NÃO processa dinheiro.
-- Ele só registra: (1) lojas confiáveis com CNPJ que aceitaram o termo
-- de responsabilidade, (2) o endereço (cidade/UF) de compradores e
-- vendedores pra achar a loja mais próxima, e (3) ofertas feitas em
-- cartas específicas do fichário. O pagamento em si (Pix, dinheiro)
-- acontece fora do app, direto entre comprador e loja.
--
-- Escopo geográfico inicial: Belo Horizonte e São Paulo.
-- ================================================================

-- ── 1. LOJAS CONFIÁVEIS (CNPJ obrigatório) ────────────────────────
create table if not exists trusted_stores (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid references auth.users(id),           -- dono da loja, se algum dia tiver login próprio
  nome_fantasia   text not null,
  razao_social    text,
  cnpj            text not null,
  telefone        text,
  whatsapp        text,
  email           text,
  cep             text,
  logradouro      text,
  numero          text,
  bairro          text,
  cidade          text not null,
  uf              text not null,
  comissao_pct    numeric not null default 10 check (comissao_pct >= 0 and comissao_pct <= 100),
  status          text not null default 'pendente' check (status in ('pendente','ativa','suspensa','rejeitada')),
  -- termo de responsabilidade (a loja recebe/confere a carta e retém dinheiro de terceiro até repassar)
  termo_versao    text not null default 'v1',
  termo_aceito    boolean not null default false,
  termo_aceito_por text,      -- nome do responsável legal que assinou/aceitou
  termo_aceito_em  timestamptz,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table trusted_stores enable row level security;

-- Qualquer usuário logado pode CADASTRAR uma loja (fica pendente até aprovação)
drop policy if exists "trusted_stores_insert_pending" on trusted_stores;
create policy "trusted_stores_insert_pending" on trusted_stores
  for insert with check (status = 'pendente');

-- Todo mundo logado pode ver lojas ativas; o dono vê sua própria mesmo pendente;
-- o admin (Eduardo) vê tudo.
drop policy if exists "trusted_stores_select" on trusted_stores;
create policy "trusted_stores_select" on trusted_stores
  for select using (
    status = 'ativa'
    or owner_user_id = auth.uid()
    or auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
  );

-- Só o admin aprova/suspende/edita status; o dono pode editar dados de contato (não o status)
drop policy if exists "trusted_stores_update_admin" on trusted_stores;
create policy "trusted_stores_update_admin" on trusted_stores
  for update using (
    auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    or owner_user_id = auth.uid()
  );

drop policy if exists "trusted_stores_delete_admin" on trusted_stores;
create policy "trusted_stores_delete_admin" on trusted_stores
  for delete using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- ── 2. ENDEREÇO DO USUÁRIO (comprador e vendedor) ─────────────────
-- Só cidade/UF são expostos pra outros usuários (via card_offers);
-- o resto fica privado, só o próprio dono lê.
create table if not exists user_addresses (
  user_id     uuid primary key references auth.users(id) default auth.uid(),
  cep         text,
  logradouro  text,
  numero      text,
  bairro      text,
  cidade      text not null,
  uf          text not null,
  updated_at  timestamptz not null default now()
);

alter table user_addresses enable row level security;

drop policy if exists "user_addresses_own" on user_addresses;
create policy "user_addresses_own" on user_addresses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 3. OFERTAS EM CARTAS DO FICHÁRIO ───────────────────────────────
-- slot_key no mesmo formato de `collection`/`card_listings`: "<setId>:<n>:<ver>"
create table if not exists card_offers (
  id              bigint generated always as identity primary key,
  buyer_id        uuid not null default auth.uid() references auth.users(id),
  seller_id       uuid not null references auth.users(id),
  slot_key        text not null,
  set_id          text not null,
  card_n          text not null,
  version         text not null,
  card_name       text not null,
  offer_price     numeric not null check (offer_price > 0),
  buyer_cidade    text not null,
  buyer_uf        text not null,
  store_id        uuid references trusted_stores(id),
  message         text,
  status          text not null default 'pendente' check (status in ('pendente','aceita','recusada','expirada','cancelada')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table card_offers enable row level security;

-- Comprador e vendedor enxergam as ofertas em que aparecem
drop policy if exists "card_offers_select" on card_offers;
create policy "card_offers_select" on card_offers
  for select using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Só o comprador cria a oferta (em nome dele mesmo)
drop policy if exists "card_offers_insert" on card_offers;
create policy "card_offers_insert" on card_offers
  for insert with check (buyer_id = auth.uid());

-- Comprador pode cancelar a própria oferta; vendedor pode aceitar/recusar
drop policy if exists "card_offers_update" on card_offers;
create policy "card_offers_update" on card_offers
  for update using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Pra conferir depois de rodar:
-- select * from trusted_stores;
-- select * from user_addresses where user_id = auth.uid();
-- select * from card_offers where seller_id = auth.uid() or buyer_id = auth.uid();
