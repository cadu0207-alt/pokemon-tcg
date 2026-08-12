-- ================================================================
-- MyDeck — SISTEMA DE LEILÃO (leilao_setup.sql) — v2
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- Se já rodou a v1 deste arquivo antes, pode rodar essa v2 por cima —
-- todo `create table if not exists` e `drop policy if exists` são
-- seguros de repetir.
--
-- v2 (12/08/2026) incorpora o que o Eduardo trouxe do grupo real de
-- leilão (WhatsApp "JOTA COLEÇÕES"):
--  • RODADAS semanais — várias cartas fecham juntas, com um prazo de
--    PAGAMENTO separado do prazo do lance (leilão fecha domingo,
--    pagamento vence terça, por ex.).
--  • CARRINHO único por comprador por rodada — quem arremata 3 cartas
--    na mesma rodada recebe UM pedido/PIX, não três.
--  • Segundo leiloeiro autorizado (auction_admins) — o Eduardo
--    continua sendo o admin principal (único que pode autorizar/
--    remover outros leiloeiros), mas outra pessoa pode cadastrar
--    cartas e fechar rodadas.
--  • Bloqueio de inadimplência: quem não paga até o prazo fica
--    impedido de dar novos lances até o leiloeiro liberar. SEM
--    exposição pública (o grupo do WhatsApp fazia isso — decidimos
--    não replicar por ser arriscado eticamente e legalmente).
--
-- Segue a mesma regra de segurança da v1: todo lance e todo
-- fechamento passam por função RPC (security definer) no banco,
-- nunca por INSERT/UPDATE direto do client.
-- ================================================================

-- ── 0. LEILOEIROS AUTORIZADOS ──────────────────────────────────────
-- O Eduardo (ADMIN_UID abaixo) é sempre o admin principal — só ele
-- autoriza/remove outros leiloeiros. Qualquer pessoa em auction_admins
-- ganha os mesmos poderes de leiloeiro (cadastrar carta, fechar
-- rodada, marcar pagamento) SEM virar admin geral do site (isAdmin()
-- do lojas.js continua só pro Eduardo — isso aqui é um poder à parte,
-- só do módulo de leilão).
create table if not exists auction_admins (
  user_id     uuid primary key references auth.users(id),
  email       text not null,
  added_by    uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table auction_admins enable row level security;

-- cada leiloeiro vê só a própria linha (pra o client saber "eu sou
-- leiloeiro?"); o admin principal vê a lista toda pra gerenciar.
drop policy if exists "auction_admins_select" on auction_admins;
create policy "auction_admins_select" on auction_admins
  for select using (
    user_id = auth.uid()
    or auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
  );

drop policy if exists "auction_admins_insert_admin" on auction_admins;
create policy "auction_admins_insert_admin" on auction_admins
  for insert with check (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

drop policy if exists "auction_admins_delete_admin" on auction_admins;
create policy "auction_admins_delete_admin" on auction_admins
  for delete using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- Função helper usada em todas as outras policies/funções abaixo:
-- "esse usuário pode agir como leiloeiro?" (admin principal OU
-- cadastrado em auction_admins).
create or replace function is_auction_admin(p_uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_uid is not null and (
    p_uid = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
    or exists(select 1 from auction_admins where user_id = p_uid)
  );
$$;
grant execute on function is_auction_admin(uuid) to authenticated;

-- Cadastra um leiloeiro pelo e-mail. A pessoa PRECISA já ter feito
-- login no MyDeck pelo menos uma vez (senão não existe em auth.users
-- ainda e a função avisa isso). Só o admin principal pode chamar.
create or replace function add_auction_admin(p_email text)
returns auction_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_row auction_admins%rowtype;
begin
  if auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'Só o administrador principal pode cadastrar leiloeiros.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'Nenhum usuário encontrado com esse e-mail. A pessoa precisa entrar no MyDeck (fazer login) pelo menos uma vez antes de ser autorizada.';
  end if;
  insert into auction_admins (user_id, email) values (v_uid, lower(p_email))
    on conflict (user_id) do update set email = excluded.email
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function add_auction_admin(text) to authenticated;

create or replace function remove_auction_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'Só o administrador principal pode remover leiloeiros.';
  end if;
  delete from auction_admins where lower(email) = lower(p_email);
end;
$$;
grant execute on function remove_auction_admin(text) to authenticated;

-- ── 1. RODADAS (agrupam várias cartas com o mesmo prazo) ──────────
create table if not exists auction_rounds (
  id              bigint generated always as identity primary key,
  created_by      uuid not null default auth.uid() references auth.users(id),
  title           text not null,                 -- ex: "Rodada 6"
  start_at        timestamptz not null,
  end_at          timestamptz not null check (end_at > start_at),
  payment_due_at  timestamptz not null check (payment_due_at >= end_at),
  shipping_note   text,   -- texto livre: frete grátis a partir de X, envelope grátis, etc.
  status          text not null default 'agendado' check (status in ('agendado','ativo','encerrado','cancelado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table auction_rounds enable row level security;

drop policy if exists "auction_rounds_select" on auction_rounds;
create policy "auction_rounds_select" on auction_rounds
  for select using (status in ('agendado','ativo','encerrado') or is_auction_admin());

drop policy if exists "auction_rounds_insert_admin" on auction_rounds;
create policy "auction_rounds_insert_admin" on auction_rounds
  for insert with check (is_auction_admin());

drop policy if exists "auction_rounds_update_admin" on auction_rounds;
create policy "auction_rounds_update_admin" on auction_rounds
  for update using (is_auction_admin());

drop policy if exists "auction_rounds_delete_admin" on auction_rounds;
create policy "auction_rounds_delete_admin" on auction_rounds
  for delete using (is_auction_admin());

-- ── 2. LEILÕES (uma linha = uma carta em leilão, dentro de uma rodada) ─
create table if not exists auctions (
  id                bigint generated always as identity primary key,
  round_id          bigint not null references auction_rounds(id) on delete cascade,
  created_by        uuid not null default auth.uid() references auth.users(id),
  card_name         text not null,
  set_id            text,
  card_n            text,
  version           text,
  image_url         text,
  condition         text not null default 'M' check (condition in ('M','NM','MP','D')),
  language          text not null default 'pt-BR' check (language in ('pt-BR','en','ja')),
  description       text,
  starting_price    numeric not null check (starting_price > 0),
  min_increment     numeric not null default 5 check (min_increment > 0),
  reserve_price     numeric check (reserve_price is null or reserve_price >= starting_price),
  current_bid       numeric,
  current_bidder    uuid references auth.users(id),
  bid_count         integer not null default 0,
  anti_snipe_minutes integer not null default 3 check (anti_snipe_minutes >= 0 and anti_snipe_minutes <= 30),
  start_at          timestamptz not null,
  end_at            timestamptz not null check (end_at > start_at),
  status            text not null default 'agendado' check (status in ('agendado','ativo','encerrado','cancelado')),
  winner_id         uuid references auth.users(id),
  winning_bid       numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Se você rodou a v1 antes de existir `round_id`/`auction_rounds`, essa
-- migração cria uma rodada "avulsa" e associa qualquer leilão antigo
-- órfão a ela, pra não perder dado nem quebrar o not null acima.
do $$
declare
  v_default_round bigint;
begin
  if exists (select 1 from information_schema.columns where table_name='auctions' and column_name='round_id') then
    if exists (select 1 from auctions where round_id is null) then
      insert into auction_rounds (title, start_at, end_at, payment_due_at, status)
        values ('Rodada migrada (leilões antigos)', now(), now() + interval '7 days', now() + interval '9 days', 'encerrado')
        returning id into v_default_round;
      update auctions set round_id = v_default_round where round_id is null;
    end if;
  end if;
end $$;

alter table auctions enable row level security;

drop policy if exists "auctions_select" on auctions;
create policy "auctions_select" on auctions
  for select using (
    status in ('agendado','ativo','encerrado')
    or created_by = auth.uid()
    or is_auction_admin()
  );

drop policy if exists "auctions_insert_admin" on auctions;
create policy "auctions_insert_admin" on auctions
  for insert with check (is_auction_admin());

drop policy if exists "auctions_update_admin" on auctions;
create policy "auctions_update_admin" on auctions
  for update using (is_auction_admin());

drop policy if exists "auctions_delete_admin" on auctions;
create policy "auctions_delete_admin" on auctions
  for delete using (is_auction_admin());

-- ── 3. LANCES ──────────────────────────────────────────────────────
create table if not exists auction_bids (
  id          bigint generated always as identity primary key,
  auction_id  bigint not null references auctions(id) on delete cascade,
  bidder_id   uuid not null references auth.users(id),
  amount      numeric not null check (amount > 0),
  created_at  timestamptz not null default now()
);

alter table auction_bids enable row level security;

drop policy if exists "auction_bids_select" on auction_bids;
create policy "auction_bids_select" on auction_bids
  for select using (bidder_id = auth.uid() or is_auction_admin());

-- Sem policy de INSERT/UPDATE/DELETE — todo lance passa por place_bid().

-- ── 4. BLOQUEIO DE INADIMPLÊNCIA ───────────────────────────────────
-- Sem "exposição pública" (diferente do grupo do WhatsApp) — só um
-- bloqueio silencioso de novos lances até o leiloeiro liberar.
create table if not exists auction_bidder_flags (
  user_id     uuid primary key references auth.users(id),
  blocked     boolean not null default false,
  reason      text,
  updated_at  timestamptz not null default now()
);

alter table auction_bidder_flags enable row level security;

drop policy if exists "auction_bidder_flags_select" on auction_bidder_flags;
create policy "auction_bidder_flags_select" on auction_bidder_flags
  for select using (user_id = auth.uid() or is_auction_admin());

drop policy if exists "auction_bidder_flags_update_admin" on auction_bidder_flags;
create policy "auction_bidder_flags_update_admin" on auction_bidder_flags
  for update using (is_auction_admin());

drop policy if exists "auction_bidder_flags_insert_admin" on auction_bidder_flags;
create policy "auction_bidder_flags_insert_admin" on auction_bidder_flags
  for insert with check (is_auction_admin());

-- ── 5. PEDIDOS = CARRINHO por (rodada, comprador) ─────────────────
-- Um pedido só por comprador por rodada, mesmo que ele tenha ganho
-- várias cartas — um PIX cobrindo tudo, igual o fluxo real do grupo.
create table if not exists auction_orders (
  id                  bigint generated always as identity primary key,
  round_id            bigint not null references auction_rounds(id),
  buyer_id            uuid not null references auth.users(id),
  amount              numeric not null default 0 check (amount >= 0),
  payment_due_at      timestamptz,
  buyer_email         text,
  status              text not null default 'aguardando_pagamento'
                        check (status in ('aguardando_pagamento','pago','enviado','concluido','cancelado')),
  shipping_snapshot   jsonb,
  tracking_code       text,
  paid_at             timestamptz,
  shipped_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (round_id, buyer_id)
);

alter table auction_orders enable row level security;

drop policy if exists "auction_orders_select" on auction_orders;
create policy "auction_orders_select" on auction_orders
  for select using (buyer_id = auth.uid() or is_auction_admin());

drop policy if exists "auction_orders_update_admin" on auction_orders;
create policy "auction_orders_update_admin" on auction_orders
  for update using (is_auction_admin());

-- Sem policy de INSERT — pedido nasce só dentro de close_round().

-- Itens do carrinho: cada carta arrematada linkada ao pedido consolidado.
create table if not exists auction_order_items (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references auction_orders(id) on delete cascade,
  auction_id  bigint not null unique references auctions(id),
  amount      numeric not null check (amount > 0),
  created_at  timestamptz not null default now()
);

alter table auction_order_items enable row level security;

drop policy if exists "auction_order_items_select" on auction_order_items;
create policy "auction_order_items_select" on auction_order_items
  for select using (
    is_auction_admin()
    or exists(select 1 from auction_orders o where o.id = order_id and o.buyer_id = auth.uid())
  );

-- ── 6. RPC place_bid — valida e registra o lance de forma atômica ──
create or replace function place_bid(p_auction_id bigint, p_amount numeric)
returns auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction  auctions%rowtype;
  v_min_next numeric;
  v_now      timestamptz := now();
  v_blocked  boolean;
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado para dar lance.';
  end if;

  select blocked into v_blocked from auction_bidder_flags where user_id = auth.uid();
  if v_blocked then
    raise exception 'Você está temporariamente bloqueado de dar lances por pagamento pendente de uma rodada anterior. Fale com o leiloeiro pra liberar.';
  end if;

  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Leilão não encontrado.';
  end if;

  if v_auction.status <> 'ativo' or v_now < v_auction.start_at or v_now > v_auction.end_at then
    raise exception 'Este leilão não está aceitando lances no momento.';
  end if;

  if v_auction.created_by = auth.uid() then
    raise exception 'O leiloeiro não pode dar lance no próprio leilão.';
  end if;

  if v_auction.current_bidder = auth.uid() then
    raise exception 'Você já é o maior lance deste leilão — aguarde outro participante cobrir.';
  end if;

  if v_auction.current_bid is null then
    v_min_next := v_auction.starting_price;
  else
    v_min_next := v_auction.current_bid + v_auction.min_increment;
  end if;

  if p_amount < v_min_next then
    raise exception 'Lance mínimo atual é R$ %', to_char(v_min_next, 'FM999999990.00');
  end if;

  insert into auction_bids (auction_id, bidder_id, amount) values (p_auction_id, auth.uid(), p_amount);

  update auctions set
    current_bid    = p_amount,
    current_bidder = auth.uid(),
    bid_count      = bid_count + 1,
    end_at = case
      when v_auction.anti_snipe_minutes > 0
       and v_auction.end_at - v_now < (v_auction.anti_snipe_minutes || ' minutes')::interval
      then v_now + (v_auction.anti_snipe_minutes || ' minutes')::interval
      else v_auction.end_at
    end,
    updated_at = v_now
  where id = p_auction_id
  returning * into v_auction;

  return v_auction;
end;
$$;

grant execute on function place_bid(bigint, numeric) to authenticated;

-- ── 7. RPC close_round — fecha os leilões vencidos de UMA rodada e
-- consolida os arremates de cada comprador em UM pedido (carrinho) ──
-- Idempotente. Chamada "preguiçosa" pelo front ao abrir a aba Leilão.
create or replace function close_round(p_round_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_auction    record;
  v_has_winner boolean;
  v_addr       jsonb;
  v_email      text;
  v_order_id   bigint;
  v_round      auction_rounds%rowtype;
  v_still_open boolean;
begin
  select * into v_round from auction_rounds where id = p_round_id for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;

  for r_auction in
    select * from auctions
    where round_id = p_round_id and status = 'ativo' and now() > end_at
    for update
  loop
    v_has_winner := r_auction.current_bidder is not null
      and (r_auction.reserve_price is null or r_auction.current_bid >= r_auction.reserve_price);

    if v_has_winner then
      update auctions set
        status = 'encerrado', winner_id = r_auction.current_bidder, winning_bid = r_auction.current_bid,
        updated_at = now()
      where id = r_auction.id;

      select to_jsonb(a) into v_addr from user_addresses a where a.user_id = r_auction.current_bidder;
      select email into v_email from auth.users where id = r_auction.current_bidder;

      -- upsert do carrinho (rodada, comprador) — soma o valor dessa carta
      insert into auction_orders (round_id, buyer_id, amount, payment_due_at, buyer_email, shipping_snapshot)
      values (p_round_id, r_auction.current_bidder, r_auction.current_bid, v_round.payment_due_at, v_email, v_addr)
      on conflict (round_id, buyer_id) do update set
        amount = auction_orders.amount + excluded.amount,
        updated_at = now()
      returning id into v_order_id;

      insert into auction_order_items (order_id, auction_id, amount)
      values (v_order_id, r_auction.id, r_auction.current_bid)
      on conflict (auction_id) do nothing;
    else
      update auctions set status = 'encerrado', updated_at = now() where id = r_auction.id;
    end if;
  end loop;

  -- fecha a rodada quando não sobrar leilão 'ativo' dentro dela
  select exists(select 1 from auctions where round_id = p_round_id and status = 'ativo') into v_still_open;
  if not v_still_open and v_round.status <> 'encerrado' then
    update auction_rounds set status = 'encerrado', updated_at = now() where id = p_round_id;
  end if;
end;
$$;

grant execute on function close_round(bigint) to authenticated;

-- ── 8. RPCs de manutenção lazy (chamadas pelo front, sem cron) ────
create or replace function activate_scheduled_auctions()
returns void
language sql
security definer
set search_path = public
as $$
  update auction_rounds set status = 'ativo', updated_at = now()
  where status = 'agendado' and now() >= start_at and now() <= end_at;

  update auctions set status = 'ativo', updated_at = now()
  where status = 'agendado' and now() >= start_at and now() <= end_at;
$$;
grant execute on function activate_scheduled_auctions() to authenticated;

-- fecha automaticamente qualquer rodada com leilão vencido pendente
create or replace function close_all_expired_rounds()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct round_id from auctions where status = 'ativo' and now() > end_at
  loop
    perform close_round(r.round_id);
  end loop;
end;
$$;
grant execute on function close_all_expired_rounds() to authenticated;

-- marca como bloqueado quem está com pedido vencido (payment_due_at no
-- passado e ainda "aguardando_pagamento") — bloqueio silencioso, sem
-- exposição pública. Chamado lazy pelo front.
create or replace function flag_overdue_bidders()
returns void
language sql
security definer
set search_path = public
as $$
  insert into auction_bidder_flags (user_id, blocked, reason, updated_at)
  select buyer_id, true, 'Pagamento em atraso — pedido #' || id, now()
  from auction_orders
  where status = 'aguardando_pagamento' and payment_due_at < now()
  on conflict (user_id) do update set
    blocked = true,
    reason = excluded.reason,
    updated_at = now()
  where auction_bidder_flags.blocked = false;
$$;
grant execute on function flag_overdue_bidders() to authenticated;

-- Pra conferir depois de rodar:
-- select add_auction_admin('juanvvictorr@gmail.com');   -- autoriza o Juan (ele precisa já ter logado 1x no site)
-- select * from auction_admins;
-- select * from auction_rounds order by created_at desc;
-- select * from auctions order by created_at desc;
-- select * from auction_orders order by created_at desc;
-- select * from auction_order_items;
-- select * from auction_bidder_flags where blocked;
