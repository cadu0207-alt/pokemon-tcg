-- ================================================================
-- MyDeck — SISTEMA DE COMPRA/VENDA · Tabela buy_orders (lado da compra)
--
-- card_listings já é o lado da VENDA (ask) — uma carta que alguém tem
-- e quer vender, com preço pedido.
-- buy_orders é o lado da COMPRA (bid) — uma carta que alguém NÃO tem
-- (ou quer mais cópias) e o valor que topa pagar por ela. Não precisa
-- de vendedor definido no momento do cadastro: é só "eu quero essa
-- carta, por esse preço", igual um livro de ofertas de bolsa.
--
-- Uso pensado pro futuro (ainda não implementado nesta versão):
-- quando um buy_order.max_price >= card_listings.price pra o mesmo
-- slot_key, os dois "batem" (match) e dispara uma conversa entre
-- comprador e vendedor. Por isso as duas tabelas usam o mesmo formato
-- de slot_key ("<setId>:<n>:<ver>") desde já — facilita o cruzamento
-- (join) quando essa parte for construída.
-- ================================================================

create table if not exists buy_orders (
  id          bigint generated always as identity primary key,
  buyer_id    uuid not null default auth.uid() references auth.users(id),
  slot_key    text not null,
  set_id      text not null,
  card_n      text not null,
  version     text not null,
  card_name   text not null,
  qty         integer not null default 1 check (qty > 0),
  max_price   numeric not null check (max_price > 0),
  status      text not null default 'ativa' check (status in ('ativa','concluida','cancelada')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (buyer_id, slot_key)
);

alter table buy_orders enable row level security;

-- Qualquer usuário logado pode ver ordens de compra ativas — é o "livro"
-- público de demanda, pra quem tem a carta saber que existe interesse
-- e por quanto. Cada usuário só edita/apaga a própria ordem.
drop policy if exists "buy_orders_select" on buy_orders;
create policy "buy_orders_select" on buy_orders
  for select using (status = 'ativa' or buyer_id = auth.uid());

drop policy if exists "buy_orders_insert" on buy_orders;
create policy "buy_orders_insert" on buy_orders
  for insert with check (buyer_id = auth.uid());

drop policy if exists "buy_orders_update" on buy_orders;
create policy "buy_orders_update" on buy_orders
  for update using (buyer_id = auth.uid());

drop policy if exists "buy_orders_delete" on buy_orders;
create policy "buy_orders_delete" on buy_orders
  for delete using (buyer_id = auth.uid());

-- Pra conferir depois de rodar:
-- select * from buy_orders where status = 'ativa' order by created_at desc;
-- select * from buy_orders where buyer_id = auth.uid();
