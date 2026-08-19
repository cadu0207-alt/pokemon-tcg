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
  -- sem "not null"/default auth.uid() de propósito: quando essa tabela é
  -- alimentada via add_auction_admin() chamada direto no SQL Editor do
  -- Supabase (não pelo site), não existe JWT de sessão e auth.uid() vem
  -- null — descoberto em 12/08/2026 quando o cadastro do Juan falhou com
  -- "null value in column added_by violates not-null constraint".
  added_by    uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- Migração pra quem já rodou a v2 anterior com added_by not null:
alter table auction_admins alter column added_by drop not null;
alter table auction_admins alter column added_by drop default;

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
  -- auth.uid() vem null quando chamado direto no SQL Editor do Supabase
  -- (sem JWT de sessão) — nesse caso é sempre confiável, porque só o
  -- Eduardo tem acesso ao painel do Supabase pra rodar SQL. Só bloqueia
  -- quando HÁ uma sessão de usuário logado E ela não é a do admin
  -- principal (isso cobre o caso de alguém tentar chamar essa função
  -- pelo site/console do navegador sem ser o Eduardo).
  if auth.uid() is not null and auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'Só o administrador principal pode cadastrar leiloeiros.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'Nenhum usuário encontrado com esse e-mail. A pessoa precisa entrar no MyDeck (fazer login) pelo menos uma vez antes de ser autorizada.';
  end if;
  insert into auction_admins (user_id, email, added_by)
    values (v_uid, lower(p_email), coalesce(auth.uid(), 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'))
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
  if auth.uid() is not null and auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
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

-- ── 5b. Incremento mínimo por faixa (regra fixa do leiloeiro, 12/08/2026) ─
-- Até R$10 → incremento R$0,50 · até R$50 → R$1,00 · acima de R$50 → 2% do
-- valor atual. Substitui o campo `auctions.min_increment` (a coluna
-- continua existindo no schema por compatibilidade, mas não é mais usada
-- no cálculo — a regra agora é sempre essa, igual pra todo leilão).
create or replace function auction_min_increment(p_base numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_base <= 10 then 0.50
    when p_base <= 50 then 1.00
    else round(p_base * 0.02, 2)
  end;
$$;

-- ── 5c. ACEITE DAS REGRAS (uma vez por usuário) ────────────────────
-- Guarda que o participante já leu e aceitou as regras de conduta do
-- leilão — o popup (front, leilao.js) só aparece de novo se a versão
-- do texto mudar (rules_version). Sem isso não dá pra dar lance.
create table if not exists auction_rules_acceptance (
  user_id        uuid primary key references auth.users(id),
  rules_version  text not null default 'v1',
  accepted_at    timestamptz not null default now()
);

alter table auction_rules_acceptance enable row level security;

drop policy if exists "auction_rules_acceptance_select" on auction_rules_acceptance;
create policy "auction_rules_acceptance_select" on auction_rules_acceptance
  for select using (user_id = auth.uid() or is_auction_admin());

drop policy if exists "auction_rules_acceptance_insert" on auction_rules_acceptance;
create policy "auction_rules_acceptance_insert" on auction_rules_acceptance
  for insert with check (user_id = auth.uid());

drop policy if exists "auction_rules_acceptance_update" on auction_rules_acceptance;
create policy "auction_rules_acceptance_update" on auction_rules_acceptance
  for update using (user_id = auth.uid());

-- ── 5d. LOG DE LANCES COM INICIAIS (transparência sem expor identidade) ─
-- auction_bids só é legível pelo próprio autor do lance ou pelo leiloeiro
-- (seção 3) — de propósito, pra não expor quem é cada bidder pros outros
-- participantes. Mas dá pra mostrar um histórico público tipo "E.C.A em
-- 12/08/2026, R$1,50" sem vazar identidade: essa função roda com
-- privilégio elevado (security definer), busca o nome em auth.users,
-- reduz pra iniciais, e só devolve isso — nunca o uid, e-mail ou nome
-- completo. Qualquer usuário logado pode chamar, pra qualquer leilão.
create or replace function auction_bidder_initials(p_uid uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_meta  jsonb;
  v_email text;
  v_name  text;
  v_parts text[];
begin
  select raw_user_meta_data, email into v_meta, v_email from auth.users where id = p_uid;
  v_name := nullif(trim(coalesce(v_meta->>'full_name', v_meta->>'name', '')), '');
  if v_name is not null then
    select array_agg(upper(left(p,1))) into v_parts
      from unnest((regexp_split_to_array(v_name, '\s+'))[1:4]) p
      where length(p) > 0;
    if v_parts is not null and array_length(v_parts,1) > 0 then
      return array_to_string(v_parts, '.');
    end if;
  end if;
  if v_email is not null then
    return upper(left(split_part(v_email, '@', 1), 3));
  end if;
  return '???';
end;
$$;
grant execute on function auction_bidder_initials(uuid) to authenticated;

create or replace function auction_bid_log(p_auction_id bigint)
returns table(amount numeric, created_at timestamptz, initials text)
language sql
security definer
stable
set search_path = public
as $$
  select b.amount, b.created_at, auction_bidder_initials(b.bidder_id) as initials
  from auction_bids b
  where b.auction_id = p_auction_id
  order by b.created_at desc
  limit 50;
$$;
grant execute on function auction_bid_log(bigint) to authenticated;

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

  -- precisa ter aceitado as regras de conduta (versão atual: v1) antes do
  -- primeiro lance — checado aqui também, não só no popup do front, pra
  -- não dar pra pular a etapa mexendo direto no client.
  if not exists(select 1 from auction_rules_acceptance where user_id = auth.uid() and rules_version = 'v1') then
    raise exception 'Você precisa aceitar as regras do leilão antes de dar o primeiro lance.';
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
    v_min_next := v_auction.current_bid + auction_min_increment(v_auction.current_bid);
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

-- ================================================================
-- EXCLUSÃO (diferente de cancelar) — 12/08/2026
-- Cancelar só muda o status (mantém histórico). Excluir apaga de vez:
-- carta + lances dela, ou a rodada inteira + tudo dentro. Só o leiloeiro
-- (is_auction_admin) pode chamar — checado no servidor, não só no client.
-- ================================================================

create or replace function delete_auction(p_auction_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Apenas leiloeiros podem excluir leilões.';
  end if;
  delete from auction_order_items where auction_id = p_auction_id;
  delete from auction_bids where auction_id = p_auction_id;
  delete from auctions where id = p_auction_id;
end;
$$;
grant execute on function delete_auction(bigint) to authenticated;

create or replace function delete_auction_round(p_round_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Apenas leiloeiros podem excluir rodadas.';
  end if;
  delete from auction_order_items where auction_id in (select id from auctions where round_id = p_round_id);
  delete from auction_bids where auction_id in (select id from auctions where round_id = p_round_id);
  delete from auctions where round_id = p_round_id;
  delete from auction_orders where round_id = p_round_id;
  delete from auction_rounds where id = p_round_id;
end;
$$;
grant execute on function delete_auction_round(bigint) to authenticated;

-- ================================================================
-- PAGAMENTO ONLINE (Mercado Pago Checkout Pro) — 12/08/2026
-- Substitui o fluxo manual de PIX + "Marcar como Pago" pros pedidos de
-- leilão: o comprador paga (PIX/cartão/boleto) direto pelo Checkout Pro
-- do Mercado Pago, e a Edge Function mp-webhook confirma o pagamento e
-- marca o pedido como pago automaticamente — sem o leiloeiro precisar
-- conferir manualmente. Ver supabase/functions/mp-create-payment e
-- supabase/functions/mp-webhook.
--
-- O dinheiro cai numa conta só (Mercado Pago do Eduardo,
-- cadu0207@gmail.com) — os leilões cadastrados pelo Juan (segundo
-- leiloeiro) também são pagos nessa mesma conta; o repasse da comissão
-- dele é combinado por fora, o site não faz split automático.
--
-- Só a Edge Function (com a service_role key) grava mp_preference_id/
-- mp_payment_id/status='pago' — não existe policy de UPDATE liberando
-- isso pro client, então nem comprador nem leiloeiro conseguem forjar
-- "paguei" direto no banco.
-- ================================================================

alter table auction_orders add column if not exists mp_preference_id text;
alter table auction_orders add column if not exists mp_payment_id text;
alter table auction_orders add column if not exists payment_method text;

-- ================================================================
-- ARQUIVO DE LEILÕES — 12/08/2026
-- Rodadas encerradas viram histórico consultável e "arquiváveis" — só
-- some da lista principal (Leilões/Cadastro), não apaga nada. E uma
-- versão do log de lances com e-mail de verdade (não só iniciais) pro
-- leiloeiro conferir quem deu cada lance, ver leilao.js
-- (toggleAuctionBidLogAdmin / renderLeilaoArquivo).
-- ================================================================

alter table auction_rounds add column if not exists archived boolean not null default false;
alter table auction_rounds add column if not exists archived_at timestamptz;

-- Log completo de lances (e-mail, não só iniciais) — só leiloeiro. O
-- log público (auction_bid_log, já existente) continua só com iniciais
-- pra todo mundo, esse aqui é a versão "de bastidor" pro leiloeiro
-- apurar/conferir.
create or replace function auction_bid_log_admin(p_auction_id bigint)
returns table(bidder_id uuid, email text, amount numeric, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Apenas leiloeiros podem ver o log completo de lances.';
  end if;
  return query
    select b.bidder_id, u.email, b.amount, b.created_at
    from auction_bids b
    join auth.users u on u.id = b.bidder_id
    where b.auction_id = p_auction_id
    order by b.created_at desc;
end;
$$;
grant execute on function auction_bid_log_admin(bigint) to authenticated;

-- ================================================================
-- NOME DO LEILOEIRO (exibição pública) — 12/08/2026
-- auction_admins só guardava e-mail (e o SELECT é restrito por RLS —
-- cada um só vê a própria linha). Pra mostrar "Leiloeiro: Fulano" nas
-- cartas e nas mensagens de compartilhamento pra QUALQUER participante
-- (não só o próprio leiloeiro), precisa de: 1) um nome de exibição
-- guardado, e 2) uma forma pública de ler user_id → nome sem expor
-- e-mail nem outros dados da tabela.
-- ================================================================

alter table auction_admins add column if not exists display_name text;

-- Cadastra o admin principal (Eduardo) na mesma tabela, só pra ter uma
-- fonte única de nomes — ele já tem os poderes de leiloeiro via
-- isAdmin()/checagem de uuid direto no client e nas funções admin;
-- isso aqui é só o registro do nome de exibição dele.
insert into auction_admins (user_id, email, display_name, added_by)
values ('eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b', 'cadu0207@gmail.com', 'Eduardo', null)
on conflict (user_id) do update set display_name = excluded.display_name;

-- Se o Juan já foi autorizado antes dessa coluna existir, dá pra
-- definir o nome dele rodando (ajuste o nome se for diferente):
-- update auction_admins set display_name = 'Juan' where email = 'juanvvictorr@gmail.com';

-- Leitura pública (qualquer usuário logado, não só o leiloeiro) de
-- user_id → nome de exibição — usada pra mostrar "Leiloeiro: X" nas
-- cartas e nas mensagens de compartilhamento. Não expõe e-mail nem
-- outra coluna da tabela.
create or replace function auction_leiloeiro_names()
returns table(user_id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select aa.user_id, coalesce(nullif(trim(aa.display_name),''), split_part(aa.email,'@',1))
  from auction_admins aa;
$$;
grant execute on function auction_leiloeiro_names() to authenticated;

-- add_auction_admin ganhou um 2º parâmetro opcional (nome de exibição)
-- — recriada aqui por cima da versão anterior, mesmo comportamento de
-- permissão, só acrescenta display_name no upsert.
drop function if exists add_auction_admin(text);
create or replace function add_auction_admin(p_email text, p_display_name text default null)
returns auction_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_row auction_admins%rowtype;
begin
  if auth.uid() is not null and auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'Só o administrador principal pode cadastrar leiloeiros.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'Nenhum usuário encontrado com esse e-mail. A pessoa precisa entrar no MyDeck (fazer login) pelo menos uma vez antes de ser autorizada.';
  end if;
  insert into auction_admins (user_id, email, display_name, added_by)
    values (v_uid, lower(p_email), nullif(trim(p_display_name),''), coalesce(auth.uid(), 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'))
    on conflict (user_id) do update set
      email = excluded.email,
      display_name = coalesce(excluded.display_name, auction_admins.display_name)
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function add_auction_admin(text, text) to authenticated;

-- ================================================================
-- CONTROLE DE ENVIO E FINANCEIRO DO LEILOEIRO — 12/08/2026
-- Tudo aditivo (colunas novas com default seguro, tabela nova) — não
-- altera nenhuma coluna/policy/função existente, o leilão que já está
-- rodando continua funcionando exatamente igual.
--
-- 1) HOLD DE ENVIO: alguns compradores preferem esperar ganhar mais
--    cartas (de rodadas futuras) antes de pedir o envio, pra economizar
--    frete. O comprador decide isso no próprio pedido (RPC
--    set_order_shipping_hold — só mexe no PRÓPRIO pedido, e só nesses 3
--    campos, nunca em status/amount). O leiloeiro só enxerga o pedido
--    marcado como "segurando" no painel dele — a decisão final de
--    quando enviar continua sendo do leiloeiro.
-- 2) FINANCEIRO PRIVADO: quanto o leiloeiro pagou por cada carta
--    (auction_costs) fica numa tabela separada, nunca visível pro
--    comprador nem público — só quem é is_auction_admin() lê/escreve.
-- ================================================================

alter table auction_orders add column if not exists shipping_hold boolean not null default false;
alter table auction_orders add column if not exists shipping_hold_note text;
alter table auction_orders add column if not exists shipping_released_at timestamptz;

-- Só o próprio comprador (buyer_id = auth.uid()) consegue chamar isso, e
-- só altera os 3 campos de hold — não existe policy de UPDATE liberando
-- isso direto pro client (a única de auction_orders continua sendo
-- is_auction_admin(), do leiloeiro).
create or replace function set_order_shipping_hold(p_order_id bigint, p_hold boolean, p_note text default null)
returns auction_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row auction_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faça login.';
  end if;
  update auction_orders set
    shipping_hold = p_hold,
    shipping_hold_note = nullif(trim(coalesce(p_note,'')),''),
    shipping_released_at = case when p_hold then null else now() end,
    updated_at = now()
  where id = p_order_id and buyer_id = auth.uid()
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Pedido não encontrado ou não é seu.';
  end if;
  return v_row;
end;
$$;
grant execute on function set_order_shipping_hold(bigint, boolean, text) to authenticated;

-- ── Custo de aquisição por carta — PRIVADO do leiloeiro ───────────
create table if not exists auction_costs (
  auction_id   bigint primary key references auctions(id) on delete cascade,
  cost_price   numeric,
  note         text,
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);

alter table auction_costs enable row level security;

drop policy if exists "auction_costs_admin_all" on auction_costs;
create policy "auction_costs_admin_all" on auction_costs
  for all using (is_auction_admin()) with check (is_auction_admin());

-- ================================================================
-- CARTA ARREMATADA → FICHÁRIO — 12/08/2026
-- Depois que o leiloeiro confirma o pagamento, o comprador ganha um
-- botão "Adicionar ao Fichário" que insere a carta na coleção pessoal
-- dele (tabela `collection`, já existente — não criamos nada novo lá,
-- só reaproveitamos saveSlot() do fichario_patch.js pelo client).
-- Aqui só precisamos rastrear SE aquele item do pedido já foi
-- adicionado, pra não deixar duplicar quantity clicando 2x.
-- ================================================================

alter table auction_order_items add column if not exists added_to_collection boolean not null default false;
alter table auction_order_items add column if not exists added_to_collection_at timestamptz;

-- Só o próprio comprador do pedido (join com auction_orders.buyer_id)
-- consegue marcar o item dele — não é policy de UPDATE direta (a única
-- que existe em auction_order_items continua sendo SELECT), é só essa
-- função pontual, então não abre brecha pra alterar amount/auction_id.
create or replace function mark_order_item_added_to_collection(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login.';
  end if;
  select o.buyer_id into v_buyer
    from auction_order_items i
    join auction_orders o on o.id = i.order_id
    where i.id = p_item_id;
  if v_buyer is null then
    raise exception 'Item de pedido não encontrado.';
  end if;
  if v_buyer <> auth.uid() then
    raise exception 'Este item não é seu.';
  end if;
  update auction_order_items set
    added_to_collection = true,
    added_to_collection_at = now()
  where id = p_item_id;
end;
$$;
grant execute on function mark_order_item_added_to_collection(bigint) to authenticated;

-- ================================================================
-- TIPO DE CARTA (versão/variante) NO CADASTRO DO LEILÃO — 13/08/2026
-- auctions.version já existia na tabela (sempre ficou null até agora,
-- não tinha campo no formulário). Passa a ser preenchido pelo leiloeiro
-- na hora de cadastrar a carta, usando o MESMO vocabulário que o
-- fichário já usa (N/F/RH/SP — ver getSlots()/getVerFromRar() em
-- app.js), pra: 1) mostrar o tipo certo pros participantes no leilão,
-- e 2) pular a etapa de "qual versão você comprou" na hora de incluir
-- a carta arrematada no fichário (leilao.js, addOrderToFichario).
-- ================================================================

alter table auctions drop constraint if exists auctions_version_check;
alter table auctions add constraint auctions_version_check
  check (version is null or version in ('N','F','RH','SP'));

-- ================================================================
-- WHATSAPP DO COMPRADOR (contato bidirecional) — 18/08/2026
-- Reaproveita a mesma tabela user_addresses (compartilhada com o
-- marketplace) — coluna nova, aditiva, não mexe em nada existente.
-- O leiloeiro já podia ser contatado pelo comprador (WhatsApp fixo,
-- ver AUC_LEILOEIRO_WHATSAPP em leilao.js); agora funciona nos dois
-- sentidos: o leiloeiro consegue chamar o comprador que ganhou usando
-- o número que ele mesmo cadastrou.
--
-- Não precisa de nenhuma RPC nova pro leiloeiro ler o WhatsApp do
-- comprador — close_round() já tira um snapshot de user_addresses
-- inteiro (to_jsonb(a)) pra auction_orders.shipping_snapshot no
-- fechamento de cada rodada, então a coluna nova flui automaticamente
-- pros PRÓXIMOS pedidos fechados a partir de agora. Pedidos já
-- fechados antes de rodar esse SQL não têm o número no snapshot —
-- o botão de contato no painel do leiloeiro simplesmente não aparece
-- nesses casos (ver renderAdminOrders/contactBuyerWhatsapp).
-- ================================================================

alter table user_addresses add column if not exists whatsapp text;

-- ================================================================
-- LOJA DO LEILOEIRO — venda direta, preço fixo (cartas e produtos
-- selados) — 19/08/2026
--
-- Reaproveita toda a infraestrutura de confiança já criada pro leilão:
-- quem pode vender = is_auction_admin() (mesmo grupo Eduardo/Juan),
-- comprador precisa de endereço + WhatsApp cadastrados (user_addresses,
-- mesma tabela do leilão), contato pós-reserva é WhatsApp (mesmo
-- padrão de contactLeiloeiroWhatsapp/contactBuyerWhatsapp).
--
-- Fluxo combinado com o Eduardo: por enquanto só "Reservar + WhatsApp"
-- (sem cobrança automática) — as colunas de Mercado Pago (mp_preference_id/
-- mp_payment_id/payment_method) já ficam prontas aqui, do mesmo jeito
-- que já foi feito em auction_orders, pra quando for hora de ligar o
-- Checkout Pro nessa parte também não precisar de nova migração.
-- ================================================================

-- ── 1. ITENS DA LOJA ────────────────────────────────────────────
create table if not exists store_items (
  id             bigint generated always as identity primary key,
  created_by     uuid not null references auth.users(id) default auth.uid(),
  kind           text not null check (kind in ('carta','selado')),
  title          text not null,
  set_id         text,
  card_n         text,
  version        text check (version is null or version in ('N','F','RH','SP')),
  condition      text check (condition is null or condition in ('M','NM','MP','D')),
  language       text check (language is null or language in ('pt-BR','en','ja')),
  image_url      text,
  description    text,
  price          numeric not null check (price > 0),
  qty_total      int not null default 1 check (qty_total > 0),
  qty_reserved   int not null default 0 check (qty_reserved >= 0),
  qty_sold       int not null default 0 check (qty_sold >= 0),
  status         text not null default 'ativo' check (status in ('ativo','pausado','esgotado','removido')),
  payment_method text not null default 'whatsapp' check (payment_method in ('whatsapp','mercado_pago')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table store_items enable row level security;

-- Todo mundo vê os itens ativos/pausados/esgotados (vitrine pública);
-- "removido" só o próprio leiloeiro enxerga (soft-delete, mantém histórico).
drop policy if exists "store_items_select_public" on store_items;
create policy "store_items_select_public" on store_items
  for select using (status <> 'removido' or is_auction_admin());

-- Cadastrar/editar/remover é só leiloeiro (mesmo grupo do leilão).
drop policy if exists "store_items_admin_write" on store_items;
create policy "store_items_admin_write" on store_items
  for all using (is_auction_admin()) with check (is_auction_admin());

-- ── 2. RESERVAS/PEDIDOS DA LOJA ─────────────────────────────────
create table if not exists store_reservations (
  id                bigint generated always as identity primary key,
  item_id           bigint not null references store_items(id) on delete cascade,
  buyer_id          uuid not null references auth.users(id) default auth.uid(),
  qty               int not null check (qty > 0),
  unit_price        numeric not null,
  status            text not null default 'reservado' check (status in ('reservado','pago','enviado','concluido','cancelado','expirado')),
  buyer_email       text,
  shipping_snapshot jsonb,
  payment_method    text not null default 'whatsapp' check (payment_method in ('whatsapp','mercado_pago')),
  mp_preference_id  text,
  mp_payment_id     text,
  tracking_code     text,
  expires_at        timestamptz,
  paid_at           timestamptz,
  shipped_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table store_reservations enable row level security;

drop policy if exists "store_reservations_select" on store_reservations;
create policy "store_reservations_select" on store_reservations
  for select using (buyer_id = auth.uid() or is_auction_admin());

-- Update direto só pro leiloeiro (marcar pago/enviado/concluído — mesmo
-- padrão de markOrderPaid/markOrderShipped em auction_orders). O
-- comprador cancela só via RPC (cancel_store_reservation), que valida
-- dono + status antes de mexer. Sem policy de INSERT direta — todo
-- reserva nasce por reserve_store_item(), que valida estoque e
-- endereço/WhatsApp antes de gravar qualquer coisa.
drop policy if exists "store_reservations_admin_update" on store_reservations;
create policy "store_reservations_admin_update" on store_reservations
  for update using (is_auction_admin()) with check (is_auction_admin());

-- Ajusta o estoque (qty_reserved/qty_sold) sozinho sempre que o status
-- de uma reserva muda — assim tanto a RPC de cancelamento quanto o
-- update direto do leiloeiro (marcar pago/enviado) continuam corretos
-- sem duplicar essa lógica em cada função.
create or replace function store_reservation_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then return new; end if;

  if new.status = 'pago' and old.status = 'reservado' then
    update store_items set
      qty_reserved = greatest(qty_reserved - new.qty, 0),
      qty_sold = qty_sold + new.qty,
      updated_at = now()
    where id = new.item_id;
  elsif new.status in ('cancelado','expirado') and old.status = 'reservado' then
    update store_items set
      qty_reserved = greatest(qty_reserved - new.qty, 0),
      updated_at = now()
    where id = new.item_id;
  end if;

  update store_items set status = 'esgotado', updated_at = now()
    where id = new.item_id and status = 'ativo'
      and (qty_total - qty_reserved - qty_sold) <= 0;

  return new;
end;
$$;

drop trigger if exists trg_store_reservation_after_update on store_reservations;
create trigger trg_store_reservation_after_update
  after update on store_reservations
  for each row execute function store_reservation_after_update();

-- ── 3. RESERVAR (comprador) ─────────────────────────────────────
-- Trava a linha do item (for update) pra dois compradores não
-- conseguirem reservar a última unidade ao mesmo tempo. Exige
-- endereço + WhatsApp cadastrados (mesma exigência do leilão).
create or replace function reserve_store_item(p_item_id bigint, p_qty int default 1)
returns store_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item store_items%rowtype;
  v_addr jsonb;
  v_email text;
  v_row store_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faça login.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select * into v_item from store_items where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v_item.status <> 'ativo' then raise exception 'Esse item não está mais disponível.'; end if;
  if (v_item.qty_total - v_item.qty_reserved - v_item.qty_sold) < p_qty then
    raise exception 'Não tem mais estoque suficiente desse item.';
  end if;

  select to_jsonb(a) into v_addr from user_addresses a where a.user_id = auth.uid();
  if v_addr is null or v_addr->>'logradouro' is null or coalesce(v_addr->>'whatsapp','') = '' then
    raise exception 'Cadastre seu endereço de entrega e WhatsApp antes de reservar (aba Leilão → Meus Arremates).';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  update store_items set qty_reserved = qty_reserved + p_qty, updated_at = now()
    where id = p_item_id;

  insert into store_reservations (item_id, buyer_id, qty, unit_price, buyer_email, shipping_snapshot, expires_at)
  values (p_item_id, auth.uid(), p_qty, v_item.price, v_email, v_addr, now() + interval '24 hours')
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function reserve_store_item(bigint, int) to authenticated;

-- ── 4. CANCELAR RESERVA (comprador ou leiloeiro) ────────────────
create or replace function cancel_store_reservation(p_reservation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res store_reservations%rowtype;
begin
  select * into v_res from store_reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  if v_res.buyer_id <> auth.uid() and not is_auction_admin() then
    raise exception 'Você não pode cancelar essa reserva.';
  end if;
  if v_res.status <> 'reservado' then
    raise exception 'Essa reserva já não está mais em aberto.';
  end if;

  update store_reservations set status = 'cancelado', updated_at = now() where id = p_reservation_id;
end;
$$;
grant execute on function cancel_store_reservation(bigint) to authenticated;

-- ── 5. MANUTENÇÃO LAZY (chamada pelo front, sem cron) ───────────
-- Expira reservas de 24h que ninguém pagou — libera o estoque de volta
-- sozinho (via trigger acima). Mesmo padrão de close_all_expired_rounds.
create or replace function expire_store_reservations()
returns void
language sql
security definer
set search_path = public
as $$
  update store_reservations set status = 'expirado', updated_at = now()
  where status = 'reservado' and expires_at < now();
$$;
grant execute on function expire_store_reservations() to authenticated;

-- ================================================================
-- CUSTO DE AQUISIÇÃO DOS ITENS DA LOJA — integração com Financeiro
-- (19/08/2026)
--
-- Mesmo padrão de auction_costs: tabela PRIVADA (só leiloeiro lê/escreve
-- via is_auction_admin()), nunca exposta pro comprador. Não dá pra
-- colocar custo direto em store_items porque essa tabela tem SELECT
-- público (vitrine) — colocar lá vazaria o preço de custo pra qualquer
-- visitante que olhasse a resposta da API.
--
-- Comissão da Loja fica SEPARADA da comissão do Leilão (confirmado com
-- o Eduardo) — cada uma com sua própria progressão de faixas sobre o
-- total pago do mês; o painel mostra as duas mais um card de total
-- geral (só soma, não afeta a faixa de nenhuma das duas).
-- ================================================================

create table if not exists store_item_costs (
  item_id     bigint primary key references store_items(id) on delete cascade,
  cost_price  numeric,
  note        text,
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

alter table store_item_costs enable row level security;

drop policy if exists "store_item_costs_admin_all" on store_item_costs;
create policy "store_item_costs_admin_all" on store_item_costs
  for all using (is_auction_admin()) with check (is_auction_admin());

-- ================================================================
-- ÚLTIMOS LANCES DA RODADA (Análises) — 19/08/2026
-- Feed "por escrito" dos últimos 10 lances de TODOS os lotes ativos
-- da rodada atual: nome do comprador, valor, carta e data/hora. Só
-- leiloeiro vê (usa nome/e-mail real, não iniciais como o log
-- público auction_bid_log). Reaproveita a mesma lógica de nome de
-- auction_bidder_initials (full_name/name do metadata, senão e-mail).
-- ================================================================
create or replace function auction_round_recent_bids_admin(p_round_id bigint, p_limit int default 10)
returns table(
  auction_id bigint,
  card_name text,
  bidder_id uuid,
  bidder_name text,
  bidder_email text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Apenas leiloeiros podem ver o feed de lances.';
  end if;
  return query
    select
      b.auction_id,
      a.card_name,
      b.bidder_id,
      nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '') as bidder_name,
      u.email as bidder_email,
      b.amount,
      b.created_at
    from auction_bids b
    join auctions a on a.id = b.auction_id
    join auth.users u on u.id = b.bidder_id
    where a.round_id = p_round_id
    order by b.created_at desc
    limit p_limit;
end;
$$;
grant execute on function auction_round_recent_bids_admin(bigint, int) to authenticated;
