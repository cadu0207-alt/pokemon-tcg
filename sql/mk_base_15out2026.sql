-- MyDeck — Marketplace, BASE (15/10/2026): lojas, equipe da loja, produtos, fotos, estoque
--
-- O que é: a fundação do marketplace. Cada loja (hoje só a TOYBOX) cadastra os próprios produtos com preço, fotos
-- e quantidade em estoque, e o público vê a vitrine. Pedidos/checkout (reserva, Pix/WhatsApp, Mercado Pago) vêm
-- depois, em cima destas tabelas (ver plano do marketplace).
--
-- Regras de quem pode o quê (RLS):
--   • qualquer visitante (anon) vê loja ATIVA e produtos ATIVOS (com fotos e saldo);
--   • membro da loja (dono / gerente / estoque) vê e edita tudo da própria loja; só o admin (Eduardo) cria loja,
--     muda status/comissão/slug e vê qualquer loja;
--   • ESTOQUE só muda por mk_adjust_stock()/mk_set_stock() (extrato em mk_stock_moves) — ninguém escreve direto
--     em mk_stock;
--   • custo do produto (mk_product_costs) só o membro vê (margem do lojista nunca vai pro público);
--   • fotos no bucket público mk-products, pasta = id da loja; só membro da loja escreve.
-- Equipe: o dono (ou o admin) adiciona uma pessoa pelo e-mail da conta MyDeck (mk_add_member).

-- ── 0) quem é admin / membro ───────────────────────────────────────────────
create or replace function public.mk_is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid;
$$;

create or replace function public.mk_is_member(p_seller uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.mk_is_admin()
      or exists (select 1 from public.mk_seller_members m where m.seller_id = p_seller and m.user_id = auth.uid());
$$;

create or replace function public.mk_is_owner(p_seller uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.mk_is_admin()
      or exists (select 1 from public.mk_seller_members m where m.seller_id = p_seller and m.user_id = auth.uid() and m.role = 'dono');
$$;

-- ── 1) tabelas ─────────────────────────────────────────────────────────────
create table if not exists public.mk_sellers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  legal_name text,
  cnpj text,
  description text check (description is null or char_length(description) <= 2000),
  city text,
  uf text check (uf is null or char_length(uf) = 2),
  cep_origin text,
  whatsapp text,
  email text,
  instagram text,
  tiktok text,
  website text,
  logo_url text,
  banner_url text,
  return_policy text check (return_policy is null or char_length(return_policy) <= 2000),
  handling_days int not null default 3 check (handling_days between 0 and 60),
  flat_shipping numeric(10,2) check (flat_shipping is null or flat_shipping >= 0),
  free_shipping_over numeric(10,2) check (free_shipping_over is null or free_shipping_over >= 0),
  pickup_enabled boolean not null default false,
  pickup_note text,
  commission_pct numeric(5,2) not null default 5 check (commission_pct between 0 and 50),
  status text not null default 'pendente' check (status in ('pendente','ativa','pausada','suspensa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_seller_members (
  seller_id uuid not null references public.mk_sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'gerente' check (role in ('dono','gerente','estoque')),
  created_at timestamptz not null default now(),
  primary key (seller_id, user_id)
);
create index if not exists mk_seller_members_user_idx on public.mk_seller_members (user_id);

create table if not exists public.mk_products (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.mk_sellers(id) on delete cascade,
  kind text not null default 'outro' check (kind in ('carta','selado','acessorio','outro')),
  title text not null check (char_length(title) between 2 and 140),
  description text check (description is null or char_length(description) <= 4000),
  sku text,
  set_id text, card_n text, version text, condition text, language text,   -- só pra kind = 'carta'
  price numeric(10,2) not null check (price >= 0 and price <= 99999),
  compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price > 0),
  weight_g int check (weight_g is null or weight_g between 1 and 50000),
  length_cm numeric(6,1) check (length_cm is null or length_cm > 0),
  width_cm numeric(6,1) check (width_cm is null or width_cm > 0),
  height_cm numeric(6,1) check (height_cm is null or height_cm > 0),
  low_stock_alert int not null default 1 check (low_stock_alert >= 0),
  status text not null default 'rascunho' check (status in ('rascunho','ativo','pausado','arquivado')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mk_products_seller_idx on public.mk_products (seller_id, status, created_at desc);
create unique index if not exists mk_products_sku_uniq on public.mk_products (seller_id, sku) where sku is not null and sku <> '';

create table if not exists public.mk_product_images (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.mk_products(id) on delete cascade,
  path text not null,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists mk_product_images_idx on public.mk_product_images (product_id, position);

create table if not exists public.mk_product_costs (
  product_id bigint primary key references public.mk_products(id) on delete cascade,
  cost_price numeric(10,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_stock (
  product_id bigint primary key references public.mk_products(id) on delete cascade,
  qty_available int not null default 0 check (qty_available >= 0),
  qty_reserved int not null default 0 check (qty_reserved >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_stock_moves (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.mk_products(id) on delete cascade,
  seller_id uuid not null,
  delta int not null,
  qty_after int not null,
  kind text not null check (kind in ('inicial','entrada','saida','ajuste','venda','reserva','liberacao','cancelamento')),
  note text,
  order_id bigint,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists mk_stock_moves_idx on public.mk_stock_moves (product_id, created_at desc);

-- ── 2) gatilhos ────────────────────────────────────────────────────────────
create or replace function public.mk_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists mk_sellers_touch on public.mk_sellers;
create trigger mk_sellers_touch before update on public.mk_sellers for each row execute function public.mk_touch_updated_at();
drop trigger if exists mk_products_touch on public.mk_products;
create trigger mk_products_touch before update on public.mk_products for each row execute function public.mk_touch_updated_at();

-- o lojista edita os dados da loja, mas status, comissão e endereço (slug) são do admin
create or replace function public.mk_sellers_guard() returns trigger language plpgsql as $$
begin
  if not public.mk_is_admin() then
    new.status := old.status;
    new.commission_pct := old.commission_pct;
    new.slug := old.slug;
  end if;
  return new;
end $$;
drop trigger if exists mk_sellers_guard_trg on public.mk_sellers;
create trigger mk_sellers_guard_trg before update on public.mk_sellers for each row execute function public.mk_sellers_guard();

-- produto nunca muda de loja; todo produto nasce com linha de estoque zerada
create or replace function public.mk_products_guard() returns trigger language plpgsql as $$
begin
  if new.seller_id is distinct from old.seller_id then
    raise exception 'Um produto não pode mudar de loja.';
  end if;
  return new;
end $$;
drop trigger if exists mk_products_guard_trg on public.mk_products;
create trigger mk_products_guard_trg before update on public.mk_products for each row execute function public.mk_products_guard();

create or replace function public.mk_products_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.mk_stock (product_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists mk_products_stock_trg on public.mk_products;
create trigger mk_products_stock_trg after insert on public.mk_products for each row execute function public.mk_products_after_insert();

-- ── 3) RLS ─────────────────────────────────────────────────────────────────
alter table public.mk_sellers enable row level security;
alter table public.mk_seller_members enable row level security;
alter table public.mk_products enable row level security;
alter table public.mk_product_images enable row level security;
alter table public.mk_product_costs enable row level security;
alter table public.mk_stock enable row level security;
alter table public.mk_stock_moves enable row level security;

-- lojas
drop policy if exists mk_sellers_select on public.mk_sellers;
create policy mk_sellers_select on public.mk_sellers for select using (status = 'ativa' or public.mk_is_member(id));
drop policy if exists mk_sellers_insert on public.mk_sellers;
create policy mk_sellers_insert on public.mk_sellers for insert with check (public.mk_is_admin());
drop policy if exists mk_sellers_update on public.mk_sellers;
create policy mk_sellers_update on public.mk_sellers for update using (public.mk_is_member(id)) with check (public.mk_is_member(id));
drop policy if exists mk_sellers_delete on public.mk_sellers;
create policy mk_sellers_delete on public.mk_sellers for delete using (public.mk_is_admin());

-- equipe (leitura: a própria linha ou quem é da loja; escrita só pelas funções mk_add_member/mk_remove_member)
drop policy if exists mk_members_select on public.mk_seller_members;
create policy mk_members_select on public.mk_seller_members for select using (user_id = (select auth.uid()) or public.mk_is_member(seller_id));

-- produtos
drop policy if exists mk_products_select on public.mk_products;
create policy mk_products_select on public.mk_products for select using (
  public.mk_is_member(seller_id)
  or (status = 'ativo' and exists (select 1 from public.mk_sellers s where s.id = seller_id and s.status = 'ativa'))
);
drop policy if exists mk_products_insert on public.mk_products;
create policy mk_products_insert on public.mk_products for insert with check (public.mk_is_member(seller_id));
drop policy if exists mk_products_update on public.mk_products;
create policy mk_products_update on public.mk_products for update using (public.mk_is_member(seller_id)) with check (public.mk_is_member(seller_id));
drop policy if exists mk_products_delete on public.mk_products;
create policy mk_products_delete on public.mk_products for delete using (public.mk_is_member(seller_id));

-- fotos e saldo seguem a visibilidade do produto
drop policy if exists mk_images_select on public.mk_product_images;
create policy mk_images_select on public.mk_product_images for select using (
  exists (select 1 from public.mk_products p where p.id = product_id)   -- a policy de mk_products já filtra quem enxerga
);
drop policy if exists mk_images_write on public.mk_product_images;
create policy mk_images_write on public.mk_product_images for all
  using (exists (select 1 from public.mk_products p where p.id = product_id and public.mk_is_member(p.seller_id)))
  with check (exists (select 1 from public.mk_products p where p.id = product_id and public.mk_is_member(p.seller_id)));

drop policy if exists mk_stock_select on public.mk_stock;
create policy mk_stock_select on public.mk_stock for select using (exists (select 1 from public.mk_products p where p.id = product_id));

-- custo e extrato: só da loja
drop policy if exists mk_costs_all on public.mk_product_costs;
create policy mk_costs_all on public.mk_product_costs for all
  using (exists (select 1 from public.mk_products p where p.id = product_id and public.mk_is_member(p.seller_id)))
  with check (exists (select 1 from public.mk_products p where p.id = product_id and public.mk_is_member(p.seller_id)));

drop policy if exists mk_moves_select on public.mk_stock_moves;
create policy mk_moves_select on public.mk_stock_moves for select using (public.mk_is_member(seller_id));

-- ── 4) funções de escrita controlada ───────────────────────────────────────
create or replace function public.mk_adjust_stock(p_product bigint, p_delta int, p_kind text default 'ajuste', p_note text default null)
returns public.mk_stock
language plpgsql security definer set search_path = public as $$
declare
  v_seller uuid;
  v_row public.mk_stock;
  v_new int;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if p_kind not in ('inicial','entrada','saida','ajuste') then raise exception 'Tipo de movimento inválido.'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Informe uma quantidade diferente de zero.'; end if;
  if abs(p_delta) > 100000 then raise exception 'Quantidade fora do limite.'; end if;
  select seller_id into v_seller from public.mk_products where id = p_product;
  if v_seller is null then raise exception 'Produto não encontrado.'; end if;
  if not public.mk_is_member(v_seller) then raise exception 'Você não faz parte desta loja.'; end if;

  insert into public.mk_stock (product_id) values (p_product) on conflict do nothing;
  select * into v_row from public.mk_stock where product_id = p_product for update;
  v_new := v_row.qty_available + p_delta;
  if v_new < 0 then raise exception 'Estoque insuficiente: há % disponível(is) e a saída é de %.', v_row.qty_available, abs(p_delta); end if;

  update public.mk_stock set qty_available = v_new, updated_at = now() where product_id = p_product returning * into v_row;
  insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note)
  values (p_product, v_seller, p_delta, v_new, p_kind, nullif(left(trim(coalesce(p_note, '')), 200), ''));
  return v_row;
end $$;

create or replace function public.mk_set_stock(p_product bigint, p_qty int, p_note text default null)
returns public.mk_stock
language plpgsql security definer set search_path = public as $$
declare
  v_seller uuid;
  v_cur int;
begin
  if p_qty is null or p_qty < 0 or p_qty > 100000 then raise exception 'Quantidade inválida.'; end if;
  select seller_id into v_seller from public.mk_products where id = p_product;
  if v_seller is null then raise exception 'Produto não encontrado.'; end if;
  if not public.mk_is_member(v_seller) then raise exception 'Você não faz parte desta loja.'; end if;
  select coalesce((select qty_available from public.mk_stock where product_id = p_product), 0) into v_cur;
  if p_qty = v_cur then return (select s from public.mk_stock s where s.product_id = p_product); end if;
  return public.mk_adjust_stock(p_product, p_qty - v_cur, 'ajuste', coalesce(p_note, 'Contagem de estoque'));
end $$;

create or replace function public.mk_add_member(p_seller uuid, p_email text, p_role text default 'gerente')
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  if not public.mk_is_owner(p_seller) then raise exception 'Só o dono da loja pode adicionar pessoas.'; end if;
  if p_role not in ('dono','gerente','estoque') then raise exception 'Papel inválido.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then raise exception 'Não achei uma conta MyDeck com esse e-mail. A pessoa precisa se cadastrar primeiro.'; end if;
  insert into public.mk_seller_members (seller_id, user_id, role) values (p_seller, v_uid, p_role)
  on conflict (seller_id, user_id) do update set role = excluded.role;
  return v_uid;
end $$;

create or replace function public.mk_remove_member(p_seller uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mk_is_owner(p_seller) then raise exception 'Só o dono da loja pode remover pessoas.'; end if;
  delete from public.mk_seller_members where seller_id = p_seller and user_id = p_user;
end $$;

create or replace function public.mk_list_members(p_seller uuid)
returns table (user_id uuid, email text, name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.mk_is_owner(p_seller) then raise exception 'Só o dono da loja vê a equipe.'; end if;
  return query
    select m.user_id, u.email::text, coalesce(u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'full_name')::text, m.role, m.created_at
    from public.mk_seller_members m join auth.users u on u.id = m.user_id
    where m.seller_id = p_seller order by m.created_at;
end $$;

-- helpers de policy precisam rodar pra anon (devolvem false); as demais só pra logado
revoke all on function public.mk_adjust_stock(bigint,int,text,text) from public, anon;
revoke all on function public.mk_set_stock(bigint,int,text) from public, anon;
revoke all on function public.mk_add_member(uuid,text,text) from public, anon;
revoke all on function public.mk_remove_member(uuid,uuid) from public, anon;
revoke all on function public.mk_list_members(uuid) from public, anon;
grant execute on function public.mk_adjust_stock(bigint,int,text,text) to authenticated, service_role;
grant execute on function public.mk_set_stock(bigint,int,text) to authenticated, service_role;
grant execute on function public.mk_add_member(uuid,text,text) to authenticated, service_role;
grant execute on function public.mk_remove_member(uuid,uuid) to authenticated, service_role;
grant execute on function public.mk_list_members(uuid) to authenticated, service_role;
grant execute on function public.mk_is_admin() to anon, authenticated, service_role;
grant execute on function public.mk_is_member(uuid) to anon, authenticated, service_role;
grant execute on function public.mk_is_owner(uuid) to anon, authenticated, service_role;

-- ── 5) fotos (Storage): bucket público, pasta = id da loja, escrita só de membro ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mk-products', 'mk-products', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mk-products leitura publica" on storage.objects;
create policy "mk-products leitura publica" on storage.objects for select using (bucket_id = 'mk-products');
drop policy if exists "mk-products upload membro" on storage.objects;
create policy "mk-products upload membro" on storage.objects for insert with check (
  bucket_id = 'mk-products'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.mk_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "mk-products update membro" on storage.objects;
create policy "mk-products update membro" on storage.objects for update using (
  bucket_id = 'mk-products'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.mk_is_member(((storage.foldername(name))[1])::uuid))
with check (
  bucket_id = 'mk-products'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.mk_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "mk-products delete membro" on storage.objects;
create policy "mk-products delete membro" on storage.objects for delete using (
  bucket_id = 'mk-products'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.mk_is_member(((storage.foldername(name))[1])::uuid));

-- ── 6) a primeira loja: TOYBOX (dados que já estavam na aba de lojas) ───────────────────────
insert into public.mk_sellers (slug, name, description, city, uf, whatsapp, instagram, tiktok, logo_url, status)
values (
  'toybox', 'TOYBOX Artes 3D',
  'Colecionáveis, artes em 3D e Pokémon TCG.',
  'José Bonifácio', 'SP',
  '5517991620996',
  'https://www.instagram.com/toybox_colecionaveis/',
  'https://www.tiktok.com/@toyboxtcg',
  'https://toyboxtcg.netlify.app/assets/logo.jpeg',
  'ativa')
on conflict (slug) do nothing;
