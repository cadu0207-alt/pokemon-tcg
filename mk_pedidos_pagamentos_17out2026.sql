-- MyDeck — Loja Toybox: PEDIDOS, PAGAMENTOS e FRETE (17/10/2026) — o terreno para cobrar
--
-- O que entra:
--   • mk_orders / mk_order_items / mk_order_events — pedido, itens (cópia do título/preço da hora) e linha do tempo;
--   • mk_payments — pagamento SEM amarrar a um provedor: provider (manual, mercadopago, …), method (pix, cartão…),
--     status próprio do MyDeck. Trocar/entrar outro provedor = escrever um adaptador novo na Edge Function; o banco não muda;
--   • mk_payment_events — registro (e trava de repetição) dos avisos que chegam dos provedores; só service_role lê;
--   • mk_seller_secrets — chave Pix e token do provedor por loja; ninguém do navegador lê (só service_role / funções);
--   • funções de estado do pedido: criar (reserva o estoque), aplicar pagamento, expirar, cancelar, e ações da loja
--     (confirmar pagamento, separar, enviar com rastreio, entregar, cancelar).
-- Regras de ouro: preço, frete e estoque são SEMPRE calculados no servidor; criar pedido só pela Edge Function (service_role);
-- a loja só vende pelo site quando o admin liga checkout_enabled (nasce DESLIGADO — hoje o botão continua levando ao WhatsApp).

-- ── 1) loja: liga/desliga venda pelo site e formas de pagamento ─────────────────────
alter table public.mk_sellers add column if not exists checkout_enabled boolean not null default false;
alter table public.mk_sellers add column if not exists pay_methods text[] not null default array['whatsapp']::text[];
alter table public.mk_sellers drop constraint if exists mk_sellers_pay_methods_chk;
alter table public.mk_sellers add constraint mk_sellers_pay_methods_chk
  check (pay_methods <@ array['whatsapp','pix_manual','pix','card','boleto']::text[]);

-- só o admin liga o checkout e escolhe as formas de pagamento (o lojista edita o resto da loja)
create or replace function public.mk_sellers_guard() returns trigger language plpgsql as $$
begin
  if not public.mk_is_admin() then
    new.status := old.status;
    new.commission_pct := old.commission_pct;
    new.slug := old.slug;
    new.checkout_enabled := old.checkout_enabled;
    new.pay_methods := old.pay_methods;
  end if;
  return new;
end $$;

create table if not exists public.mk_seller_secrets (
  seller_id uuid primary key references public.mk_sellers(id) on delete cascade,
  pix_key text,
  pix_holder text,
  mp_access_token text,
  mp_user_id text,
  updated_at timestamptz not null default now()
);
alter table public.mk_seller_secrets enable row level security;      -- sem policy = só service_role e funções security definer

-- dono/admin grava a chave Pix (nunca lê de volta pelo navegador); mk_seller_pay_status só diz se está preenchida
create or replace function public.mk_set_pix(p_seller uuid, p_key text, p_holder text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.mk_is_owner(p_seller) then raise exception 'Só o dono da loja altera a chave Pix.'; end if;
  insert into public.mk_seller_secrets (seller_id, pix_key, pix_holder) values (p_seller, nullif(trim(p_key), ''), nullif(trim(p_holder), ''))
  on conflict (seller_id) do update set pix_key = excluded.pix_key, pix_holder = excluded.pix_holder, updated_at = now();
end $$;

create or replace function public.mk_seller_pay_status(p_seller uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.mk_seller_secrets;
begin
  if not public.mk_is_member(p_seller) then raise exception 'Você não faz parte desta loja.'; end if;
  select * into s from public.mk_seller_secrets where seller_id = p_seller;
  return jsonb_build_object('pix_key_set', coalesce(s.pix_key, '') <> '', 'pix_holder', s.pix_holder, 'pix_key_hint',
           case when coalesce(s.pix_key, '') = '' then null else '…' || right(s.pix_key, 4) end,
           'provider_token_set', coalesce(s.mp_access_token, '') <> '');
end $$;

-- ── 2) tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.mk_orders (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.mk_sellers(id),
  buyer_id uuid not null references auth.users(id),
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento','pago','em_separacao','enviado','entregue','cancelado','expirado')),
  delivery_type text not null check (delivery_type in ('envio','retirada')),
  delivery_service text,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  shipping_cost numeric(10,2) not null default 0 check (shipping_cost >= 0),
  total numeric(10,2) not null check (total >= 0),
  fee_pct numeric(5,2) not null default 0,
  fee_amount numeric(10,2) not null default 0,
  payment_method text not null,
  buyer_name text not null,
  buyer_email text,
  buyer_whatsapp text,
  shipping_snapshot jsonb,
  buyer_note text check (buyer_note is null or char_length(buyer_note) <= 500),
  tracking_code text,
  carrier text,
  expires_at timestamptz,
  paid_at timestamptz, shipped_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mk_orders_buyer_idx on public.mk_orders (buyer_id, created_at desc);
create index if not exists mk_orders_seller_idx on public.mk_orders (seller_id, status, created_at desc);
create index if not exists mk_orders_expire_idx on public.mk_orders (expires_at) where status = 'aguardando_pagamento';

create table if not exists public.mk_order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.mk_orders(id) on delete cascade,
  product_id bigint references public.mk_products(id) on delete set null,
  title text not null,
  image_url text,
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0)
);
create index if not exists mk_order_items_idx on public.mk_order_items (order_id);

create table if not exists public.mk_order_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.mk_orders(id) on delete cascade,
  actor uuid,
  event text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists mk_order_events_idx on public.mk_order_events (order_id, created_at);

create table if not exists public.mk_payments (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.mk_orders(id) on delete cascade,
  provider text not null,                                   -- 'manual' | 'mercadopago' | (outros no futuro)
  method text not null,                                     -- 'whatsapp' | 'pix_manual' | 'pix' | 'card' | 'boleto'
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado','reembolsado','expirado')),
  amount numeric(10,2) not null,
  provider_ref text,                                        -- id criado no provedor (preferência/pagamento)
  provider_payment_id text,                                 -- id do pagamento real quando o provedor avisa
  checkout_url text,
  pix_copy_paste text,
  pix_qr_base64 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mk_payments_order_idx on public.mk_payments (order_id);
create unique index if not exists mk_payments_provider_uniq on public.mk_payments (provider, provider_payment_id) where provider_payment_id is not null;

create table if not exists public.mk_payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  order_id bigint,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

drop trigger if exists mk_orders_touch on public.mk_orders;
create trigger mk_orders_touch before update on public.mk_orders for each row execute function public.mk_touch_updated_at();
drop trigger if exists mk_payments_touch on public.mk_payments;
create trigger mk_payments_touch before update on public.mk_payments for each row execute function public.mk_touch_updated_at();

-- ── 3) RLS: comprador vê o próprio pedido; a loja vê os da loja; ninguém escreve direto ─────
alter table public.mk_orders enable row level security;
alter table public.mk_order_items enable row level security;
alter table public.mk_order_events enable row level security;
alter table public.mk_payments enable row level security;
alter table public.mk_payment_events enable row level security;

drop policy if exists mk_orders_select on public.mk_orders;
create policy mk_orders_select on public.mk_orders for select using (buyer_id = (select auth.uid()) or public.mk_is_member(seller_id));
drop policy if exists mk_order_items_select on public.mk_order_items;
create policy mk_order_items_select on public.mk_order_items for select using (exists (select 1 from public.mk_orders o where o.id = order_id));
drop policy if exists mk_order_events_select on public.mk_order_events;
create policy mk_order_events_select on public.mk_order_events for select using (exists (select 1 from public.mk_orders o where o.id = order_id));
drop policy if exists mk_payments_select on public.mk_payments;
create policy mk_payments_select on public.mk_payments for select using (exists (select 1 from public.mk_orders o where o.id = order_id));
-- mk_payment_events: sem policy (só service_role)

-- ── 4) estado do pedido ─────────────────────────────────────────────────────────
create or replace function public.mk_notify(p_user uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, body, data) values (p_user, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
exception when others then
  raise warning 'mk_notify falhou (ignorado): %', sqlerrm;
end $$;

create or replace function public.mk_notify_members(p_seller uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.mk_seller_members where seller_id = p_seller loop
    perform public.mk_notify(r.user_id, p_type, p_title, p_body, p_data);
  end loop;
  perform public.mk_notify('eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid, p_type, p_title, p_body, p_data)
    where not exists (select 1 from public.mk_seller_members m where m.seller_id = p_seller and m.user_id = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid);
end $$;

-- devolve o estoque reservado de um pedido que não vai ser pago/enviado
create or replace function public.mk_release_stock(p_order bigint, p_kind text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare it record; v_seller uuid; v_new int;
begin
  select seller_id into v_seller from public.mk_orders where id = p_order;
  for it in select product_id, qty from public.mk_order_items where order_id = p_order and product_id is not null order by product_id loop
    update public.mk_stock set qty_reserved = greatest(qty_reserved - it.qty, 0), qty_available = qty_available + it.qty, updated_at = now()
     where product_id = it.product_id returning qty_available into v_new;
    insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note, order_id, created_by)
    values (it.product_id, v_seller, it.qty, coalesce(v_new, 0), p_kind, p_note, p_order, null);
  end loop;
end $$;

-- pedido pago: o que estava reservado vira vendido
create or replace function public.mk_mark_paid(p_order bigint, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.mk_orders; it record; v_new int;
begin
  select * into o from public.mk_orders where id = p_order for update;
  if o.id is null or o.status <> 'aguardando_pagamento' then return; end if;   -- idempotente
  for it in select product_id, qty from public.mk_order_items where order_id = p_order and product_id is not null order by product_id loop
    update public.mk_stock set qty_reserved = greatest(qty_reserved - it.qty, 0), updated_at = now() where product_id = it.product_id returning qty_available into v_new;
    insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note, order_id, created_by)
    values (it.product_id, o.seller_id, 0, coalesce(v_new, 0), 'venda', 'Pedido #' || p_order || ' pago', p_order, p_actor);
  end loop;
  update public.mk_orders set status = 'pago', paid_at = now(), expires_at = null where id = p_order;
  update public.mk_payments set status = 'aprovado' where order_id = p_order and status = 'pendente' and method = o.payment_method;
  insert into public.mk_order_events (order_id, actor, event, note) values (p_order, p_actor, 'pago', p_note);
  perform public.mk_notify(o.buyer_id, 'mk_order_update', 'Pagamento confirmado ✅', 'Pedido #' || p_order || ' pago. A loja vai preparar o envio.',
    jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
  perform public.mk_notify_members(o.seller_id, 'mk_order_new', 'Pedido pago 💰', 'Pedido #' || p_order || ' — ' || o.buyer_name || ' · R$ ' || replace(to_char(o.total, 'FM999990.00'), '.', ','),
    jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
end $$;

-- cria o pedido e reserva o estoque. SÓ service_role (a Edge Function já validou frete e meio de pagamento).
create or replace function public.mk_create_order(
  p_user uuid, p_seller uuid, p_items jsonb, p_delivery text, p_service text, p_shipping numeric,
  p_method text, p_expires_minutes int, p_address jsonb, p_name text, p_email text, p_whatsapp text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.mk_sellers; o public.mk_orders; it jsonb; pr public.mk_products; st public.mk_stock;
  v_sub numeric := 0; v_qty int; v_n int := 0; v_id bigint; v_img text; v_ids bigint[] := '{}'; v_new int;
begin
  select * into s from public.mk_sellers where id = p_seller;
  if s.id is null or s.status <> 'ativa' then raise exception 'Esta loja não está vendendo agora.'; end if;
  if not s.checkout_enabled then raise exception 'A compra pelo site ainda não está liberada nesta loja.'; end if;
  if not (p_method = any (s.pay_methods)) then raise exception 'Forma de pagamento indisponível nesta loja.'; end if;
  if exists (select 1 from public.mk_seller_members where seller_id = p_seller and user_id = p_user) then
    raise exception 'Quem é da equipe da loja não pode comprar nela.'; end if;
  if p_delivery not in ('envio','retirada') then raise exception 'Entrega inválida.'; end if;
  if p_delivery = 'retirada' and not s.pickup_enabled then raise exception 'Esta loja não oferece retirada.'; end if;
  if p_shipping is null or p_shipping < 0 or p_shipping > 2000 then raise exception 'Frete inválido.'; end if;
  if p_delivery = 'retirada' and p_shipping <> 0 then raise exception 'Retirada não tem frete.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Carrinho inválido.'; end if;

  -- trava as linhas de estoque em ordem (evita deadlock entre pedidos simultâneos) e valida tudo antes de reservar
  for v_id in select distinct (x->>'product_id')::bigint from jsonb_array_elements(p_items) x order by 1 loop
    v_ids := v_ids || v_id;
  end loop;
  if coalesce(array_length(v_ids, 1), 0) <> jsonb_array_length(p_items) then raise exception 'Produto repetido no carrinho.'; end if;
  foreach v_id in array v_ids loop
    select * into st from public.mk_stock where product_id = v_id for update;
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'Quantidade inválida.'; end if;
    select * into pr from public.mk_products where id = (it->>'product_id')::bigint;
    if pr.id is null or pr.seller_id <> p_seller or pr.status <> 'ativo' then raise exception 'Um dos produtos não está mais à venda.'; end if;
    select * into st from public.mk_stock where product_id = pr.id;
    if st.qty_available < v_qty then raise exception 'Estoque insuficiente de "%": restam %.', pr.title, st.qty_available; end if;
    v_sub := v_sub + pr.price * v_qty;
  end loop;

  insert into public.mk_orders (seller_id, buyer_id, delivery_type, delivery_service, subtotal, shipping_cost, total, fee_pct, fee_amount,
      payment_method, buyer_name, buyer_email, buyer_whatsapp, shipping_snapshot, buyer_note, expires_at)
  values (p_seller, p_user, p_delivery, p_service, v_sub, p_shipping, v_sub + p_shipping, s.commission_pct, round(v_sub * s.commission_pct / 100, 2),
      p_method, left(trim(p_name), 120), nullif(trim(coalesce(p_email, '')), ''), nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''),
      case when p_delivery = 'envio' then p_address else null end, nullif(left(trim(coalesce(p_note, '')), 500), ''),
      now() + make_interval(mins => greatest(5, least(coalesce(p_expires_minutes, 30), 4320))))
  returning * into o;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    select * into pr from public.mk_products where id = (it->>'product_id')::bigint;
    select url into v_img from public.mk_product_images where product_id = pr.id order by position limit 1;
    insert into public.mk_order_items (order_id, product_id, title, image_url, unit_price, qty) values (o.id, pr.id, pr.title, v_img, pr.price, v_qty);
    update public.mk_stock set qty_available = qty_available - v_qty, qty_reserved = qty_reserved + v_qty, updated_at = now()
     where product_id = pr.id returning qty_available into v_new;
    insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note, order_id, created_by)
    values (pr.id, p_seller, -v_qty, v_new, 'reserva', 'Pedido #' || o.id, o.id, p_user);
  end loop;

  insert into public.mk_order_events (order_id, actor, event, note) values (o.id, p_user, 'criado', p_method);
  if p_method in ('whatsapp','pix_manual') then   -- pagamento combinado/manual: a loja precisa ser avisada já
    perform public.mk_notify_members(p_seller, 'mk_order_new', 'Novo pedido 🛒', 'Pedido #' || o.id || ' de ' || o.buyer_name || ' · R$ ' || replace(to_char(o.total, 'FM999990.00'), '.', ',') || ' — aguardando pagamento',
      jsonb_build_object('mk_order_id', o.id, 'url', '/#mk'));
  end if;
  return to_jsonb(o);
end $$;

-- cancela/expira quando o pagamento não saiu (libera o estoque)
create or replace function public.mk_close_order(p_order bigint, p_status text, p_reason text, p_actor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.mk_orders;
begin
  select * into o from public.mk_orders where id = p_order for update;
  if o.id is null or o.status <> 'aguardando_pagamento' then return false; end if;
  perform public.mk_release_stock(p_order, case when p_status = 'expirado' then 'liberacao' else 'cancelamento' end, 'Pedido #' || p_order || ' ' || p_status);
  update public.mk_orders set status = p_status, cancelled_at = now(), cancel_reason = p_reason, expires_at = null where id = p_order;
  update public.mk_payments set status = case when p_status = 'expirado' then 'expirado' else 'cancelado' end where order_id = p_order and status = 'pendente';
  insert into public.mk_order_events (order_id, actor, event, note) values (p_order, p_actor, p_status, p_reason);
  perform public.mk_notify(o.buyer_id, 'mk_order_update', case when p_status = 'expirado' then 'Pedido expirado' else 'Pedido cancelado' end,
    'Pedido #' || p_order || ' — ' || coalesce(p_reason, 'sem pagamento no prazo') || '.', jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
  return true;
end $$;

create or replace function public.mk_expire_orders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.mk_orders where status = 'aguardando_pagamento' and expires_at is not null and expires_at < now() order by id limit 200 loop
    if public.mk_close_order(r.id, 'expirado', 'prazo de pagamento esgotado', null) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- comprador desiste enquanto ainda não pagou
create or replace function public.mk_cancel_my_order(p_order bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare o public.mk_orders;
begin
  select * into o from public.mk_orders where id = p_order;
  if o.id is null or o.buyer_id <> auth.uid() then raise exception 'Pedido não encontrado.'; end if;
  if o.status <> 'aguardando_pagamento' then raise exception 'Este pedido já foi pago ou encerrado. Fale com a loja para cancelar.'; end if;
  return public.mk_close_order(p_order, 'cancelado', 'cancelado pelo comprador', auth.uid());
end $$;

-- aplica o aviso de pagamento de um provedor (SÓ service_role; idempotente)
create or replace function public.mk_apply_payment(
  p_order bigint, p_provider text, p_provider_payment_id text, p_status text, p_amount numeric, p_event_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.mk_orders; pay public.mk_payments; v_cnt int;
begin
  if p_status not in ('pendente','aprovado','recusado','cancelado','reembolsado','expirado') then raise exception 'status de pagamento inválido'; end if;
  insert into public.mk_payment_events (provider, event_id, order_id, payload) values (p_provider, p_event_id, p_order, p_payload)
  on conflict (provider, event_id) do nothing;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  select * into o from public.mk_orders where id = p_order for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'pedido não encontrado'); end if;
  select * into pay from public.mk_payments where order_id = p_order and provider = p_provider order by created_at desc limit 1;
  if pay.id is not null then
    update public.mk_payments set provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
           status = case when pay.status = 'aprovado' then 'aprovado' else p_status end where id = pay.id;
  end if;

  if p_status = 'aprovado' then
    if p_amount is not null and p_amount + 0.009 < o.total then      -- valor pago menor que o pedido: não libera, avisa a loja
      insert into public.mk_order_events (order_id, event, note) values (p_order, 'valor_divergente', 'recebido ' || p_amount || ' de ' || o.total);
      perform public.mk_notify_members(o.seller_id, 'mk_order_new', 'Pagamento com valor diferente ⚠️', 'Pedido #' || p_order || ': recebido R$ ' || p_amount || ' de R$ ' || o.total, jsonb_build_object('mk_order_id', p_order));
      return jsonb_build_object('ok', true, 'divergent', true);
    end if;
    if o.status = 'aguardando_pagamento' then perform public.mk_mark_paid(p_order, null, p_provider || ' aprovou o pagamento');
    elsif o.status in ('cancelado','expirado') then
      insert into public.mk_order_events (order_id, event, note) values (p_order, 'pago_apos_cancelar', 'pagamento aprovado depois do pedido ' || o.status || ': reembolsar');
      perform public.mk_notify_members(o.seller_id, 'mk_order_new', 'Pagamento chegou depois do pedido encerrar ⚠️', 'Pedido #' || p_order || ' estava ' || o.status || '. Confira e reembolse ou refaça o pedido.', jsonb_build_object('mk_order_id', p_order));
    end if;
  elsif p_status = 'reembolsado' then
    insert into public.mk_order_events (order_id, event, note) values (p_order, 'reembolsado', p_provider);
    perform public.mk_notify_members(o.seller_id, 'mk_order_new', 'Pagamento reembolsado', 'Pedido #' || p_order || ' foi reembolsado no provedor.', jsonb_build_object('mk_order_id', p_order));
  elsif p_status = 'recusado' then
    insert into public.mk_order_events (order_id, event, note) values (p_order, 'pagamento_recusado', p_provider);
  end if;
  return jsonb_build_object('ok', true, 'order_status', (select status from public.mk_orders where id = p_order));
end $$;

-- ações da loja sobre o pedido
create or replace function public.mk_order_action(p_order bigint, p_action text, p_tracking text default null, p_carrier text default null, p_note text default null)
returns public.mk_orders language plpgsql security definer set search_path = public as $$
declare o public.mk_orders;
begin
  select * into o from public.mk_orders where id = p_order for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not public.mk_is_member(o.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;

  if p_action = 'confirmar_pagamento' then
    if o.status <> 'aguardando_pagamento' then raise exception 'O pedido não está aguardando pagamento.'; end if;
    perform public.mk_mark_paid(p_order, auth.uid(), 'confirmado pela loja');
  elsif p_action = 'separar' then
    if o.status <> 'pago' then raise exception 'Só dá para separar pedido pago.'; end if;
    update public.mk_orders set status = 'em_separacao' where id = p_order;
    insert into public.mk_order_events (order_id, actor, event, note) values (p_order, auth.uid(), 'em_separacao', p_note);
    perform public.mk_notify(o.buyer_id, 'mk_order_update', 'Pedido em separação 📦', 'A loja está separando o pedido #' || p_order || '.', jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
  elsif p_action = 'enviar' then
    if o.status not in ('pago','em_separacao') then raise exception 'Só dá para enviar pedido pago.'; end if;
    if o.delivery_type = 'envio' and coalesce(trim(p_tracking), '') = '' then raise exception 'Informe o código de rastreio.'; end if;
    update public.mk_orders set status = 'enviado', shipped_at = now(), tracking_code = nullif(trim(p_tracking), ''), carrier = nullif(trim(p_carrier), '') where id = p_order;
    insert into public.mk_order_events (order_id, actor, event, note) values (p_order, auth.uid(), 'enviado', coalesce(p_tracking, ''));
    perform public.mk_notify(o.buyer_id, 'mk_order_update', case when o.delivery_type = 'retirada' then 'Pedido pronto para retirar' else 'Pedido enviado 🚚' end,
      'Pedido #' || p_order || case when coalesce(trim(p_tracking), '') <> '' then ' — rastreio ' || trim(p_tracking) else '' end, jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
  elsif p_action = 'entregar' then
    if o.status <> 'enviado' then raise exception 'O pedido ainda não foi enviado.'; end if;
    update public.mk_orders set status = 'entregue', delivered_at = now() where id = p_order;
    insert into public.mk_order_events (order_id, actor, event, note) values (p_order, auth.uid(), 'entregue', p_note);
    perform public.mk_notify(o.buyer_id, 'mk_order_update', 'Pedido entregue 🎉', 'Pedido #' || p_order || ' entregue. Obrigado por comprar na Toybox!', jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
  elsif p_action = 'cancelar' then
    if o.status = 'aguardando_pagamento' then perform public.mk_close_order(p_order, 'cancelado', coalesce(nullif(trim(p_note), ''), 'cancelado pela loja'), auth.uid());
    elsif o.status in ('pago','em_separacao') then
      perform public.mk_release_stock(p_order, 'cancelamento', 'Pedido #' || p_order || ' cancelado pela loja');
      update public.mk_orders set status = 'cancelado', cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_note), ''), 'cancelado pela loja') where id = p_order;
      insert into public.mk_order_events (order_id, actor, event, note) values (p_order, auth.uid(), 'cancelado', 'pago: reembolsar o comprador. ' || coalesce(p_note, ''));
      perform public.mk_notify(o.buyer_id, 'mk_order_update', 'Pedido cancelado', 'Pedido #' || p_order || ' cancelado pela loja. Você será reembolsado.', jsonb_build_object('mk_order_id', p_order, 'url', '/#mk'));
    else raise exception 'Este pedido não pode mais ser cancelado.'; end if;
  else raise exception 'Ação desconhecida.'; end if;
  select * into o from public.mk_orders where id = p_order;
  return o;
end $$;

-- ── 5) permissões das funções ─────────────────────────────────────────────────
revoke all on function public.mk_set_pix(uuid,text,text) from public, anon;
revoke all on function public.mk_seller_pay_status(uuid) from public, anon;
revoke all on function public.mk_notify(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.mk_notify_members(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.mk_release_stock(bigint,text,text) from public, anon, authenticated;
revoke all on function public.mk_mark_paid(bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.mk_close_order(bigint,text,text,uuid) from public, anon, authenticated;
revoke all on function public.mk_create_order(uuid,uuid,jsonb,text,text,numeric,text,int,jsonb,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mk_apply_payment(bigint,text,text,text,numeric,text,jsonb) from public, anon, authenticated;
revoke all on function public.mk_expire_orders() from public, anon, authenticated;
revoke all on function public.mk_cancel_my_order(bigint) from public, anon;
revoke all on function public.mk_order_action(bigint,text,text,text,text) from public, anon;
grant execute on function public.mk_set_pix(uuid,text,text) to authenticated, service_role;
grant execute on function public.mk_seller_pay_status(uuid) to authenticated, service_role;
grant execute on function public.mk_cancel_my_order(bigint) to authenticated, service_role;
grant execute on function public.mk_order_action(bigint,text,text,text,text) to authenticated, service_role;
grant execute on function public.mk_notify(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.mk_notify_members(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.mk_release_stock(bigint,text,text) to service_role;
grant execute on function public.mk_mark_paid(bigint,uuid,text) to service_role;
grant execute on function public.mk_close_order(bigint,text,text,uuid) to service_role;
grant execute on function public.mk_create_order(uuid,uuid,jsonb,text,text,numeric,text,int,jsonb,text,text,text,text) to service_role;
grant execute on function public.mk_apply_payment(bigint,text,text,text,numeric,text,jsonb) to service_role;
grant execute on function public.mk_expire_orders() to service_role;

select cron.schedule('mk-expire-orders', '*/5 * * * *', $$select public.mk_expire_orders()$$);
