-- ════════════════════════════════════════════════════════════════════════════════
-- Loja (Toybox) — CONSIGNAÇÃO, fase 1 (23/10/2026)
-- Usuário do MyDeck envia cartas ao Alex (Toybox), que confere, publica na loja e vende por conta do usuário.
-- Regras combinadas com o Eduardo:
--   • 30 dias corridos para o Alex analisar as cartas depois de recebê-las.
--   • Consignação de 90 dias, renovada sozinha enquanto o usuário não pedir as cartas de volta.
--   • Comissão do Alex: 15% (consign_commission_pct, só o admin do MyDeck altera). Repasse até 7 dias úteis depois da
--     entrega ao comprador (fase 2 faz o cálculo/aviso; aqui já guardamos o que foi vendido).
--   • Depois do recebimento a responsabilidade pelas cartas é do Alex. Devolução: o usuário paga o frete de volta ANTES do envio.
--   • Leilão ao vivo na live do Alex é opcional, por carta (com lance mínimo).
-- Tudo desligado por padrão: mk_sellers.consign_enabled = false até o Eduardo liberar (termo ainda é rascunho p/ advogado).
-- Escritas só por funções (SECURITY DEFINER); as tabelas ficam só-leitura pra quem é dono da remessa ou da loja.
-- ════════════════════════════════════════════════════════════════════════════════

alter table public.mk_sellers
  add column if not exists consign_enabled boolean not null default false,
  add column if not exists consign_commission_pct numeric(4,1) not null default 15 check (consign_commission_pct between 0 and 50);

-- só o admin do MyDeck liga a consignação e mexe na comissão (o resto da guarda continua igual)
create or replace function public.mk_sellers_guard() returns trigger language plpgsql as $$
begin
  if not public.mk_is_admin() then
    new.status := old.status;
    new.commission_pct := old.commission_pct;
    new.slug := old.slug;
    new.checkout_enabled := old.checkout_enabled;
    new.pay_methods := old.pay_methods;
    new.consign_enabled := old.consign_enabled;
    new.consign_commission_pct := old.consign_commission_pct;
  end if;
  return new;
end $$;

-- ── termo (versionado; cada versão é imutável) ───────────────────────────────────────────────
create table if not exists public.mk_consign_terms (
  version int primary key,
  title text not null,
  body text not null,
  draft boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mk_consign_terms enable row level security;
drop policy if exists mk_consign_terms_select on public.mk_consign_terms;
create policy mk_consign_terms_select on public.mk_consign_terms for select to authenticated using (true);
revoke all on public.mk_consign_terms from anon, authenticated;
grant select on public.mk_consign_terms to authenticated;

-- ── remessas ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.mk_consignments (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.mk_sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'enviada' check (status in ('enviada','recebida','encerrada','cancelada')),
  term_version int not null references public.mk_consign_terms(version),
  accepted_at timestamptz not null default now(),
  accepted_name text not null,
  accepted_doc text not null,          -- CPF (só dígitos)
  accepted_ip text,
  accepted_ua text,
  phone text,
  pix_key text not null,
  commission_pct numeric(4,1) not null,
  carrier text,
  tracking_code text,
  shipped_at timestamptz,
  received_at timestamptz,
  review_deadline timestamptz,         -- recebimento + 30 dias
  cycle_days int not null default 90,  -- ciclo de 90 dias, renova sozinho até o usuário pedir devolução
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mk_consignments_seller_idx on public.mk_consignments (seller_id, status, created_at desc);
create index if not exists mk_consignments_user_idx on public.mk_consignments (user_id, created_at desc);

create table if not exists public.mk_consign_returns (
  id bigint generated always as identity primary key,
  consignment_id bigint not null references public.mk_consignments(id) on delete cascade,
  seller_id uuid not null,
  user_id uuid not null,
  status text not null default 'pedida' check (status in ('pedida','frete_informado','frete_pago','enviada','cancelada')),
  address text not null,
  freight_amount numeric(10,2),
  freight_note text,
  freight_paid_at timestamptz,
  carrier text,
  tracking_code text,
  shipped_at timestamptz,
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mk_consign_returns_idx on public.mk_consign_returns (consignment_id, status);

create table if not exists public.mk_consign_items (
  id bigint generated always as identity primary key,
  consignment_id bigint not null references public.mk_consignments(id) on delete cascade,
  seller_id uuid not null,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  set_label text check (set_label is null or char_length(set_label) <= 80),
  card_n text check (card_n is null or char_length(card_n) <= 20),
  language text check (language in ('pt-BR','en','ja','zh')),
  condition text check (condition in ('M','NM','MP','HP','D')),
  qty int not null check (qty between 1 and 99),
  asking_price numeric(10,2) not null check (asking_price > 0 and asking_price <= 100000),   -- preço unitário pedido pelo dono
  live_auction boolean not null default false,
  live_min_price numeric(10,2) check (live_min_price is null or live_min_price > 0),
  status text not null default 'aguardando' check (status in ('aguardando','sugestao','aprovada','recusada','a_venda','vendida','devolucao','devolvida')),
  suggested_price numeric(10,2),
  review_note text,
  reviewed_at timestamptz,
  product_id bigint references public.mk_products(id) on delete set null,
  qty_sold int not null default 0,
  sold_total numeric(10,2) not null default 0,
  sold_at timestamptz,
  return_id bigint references public.mk_consign_returns(id) on delete set null,
  status_before_return text,
  created_at timestamptz not null default now(),
  check (not live_auction or live_min_price is not null),
  check (qty_sold between 0 and qty)
);
create index if not exists mk_consign_items_c_idx on public.mk_consign_items (consignment_id);
create index if not exists mk_consign_items_seller_idx on public.mk_consign_items (seller_id, status);

alter table public.mk_products add column if not exists consign_item_id bigint references public.mk_consign_items(id) on delete set null;

-- RLS: o dono da remessa e a equipe da loja leem; ninguém escreve direto
alter table public.mk_consignments enable row level security;
alter table public.mk_consign_items enable row level security;
alter table public.mk_consign_returns enable row level security;
drop policy if exists mk_consignments_select on public.mk_consignments;
create policy mk_consignments_select on public.mk_consignments for select to authenticated using (user_id = (select auth.uid()) or public.mk_is_member(seller_id));
drop policy if exists mk_consign_items_select on public.mk_consign_items;
create policy mk_consign_items_select on public.mk_consign_items for select to authenticated using (user_id = (select auth.uid()) or public.mk_is_member(seller_id));
drop policy if exists mk_consign_returns_select on public.mk_consign_returns;
create policy mk_consign_returns_select on public.mk_consign_returns for select to authenticated using (user_id = (select auth.uid()) or public.mk_is_member(seller_id));
revoke all on public.mk_consignments, public.mk_consign_items, public.mk_consign_returns from anon, authenticated;
grant select on public.mk_consignments, public.mk_consign_items, public.mk_consign_returns to authenticated;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.mk_valid_cpf(p text) returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; i int; dv1 int; dv2 int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  dv1 := (s * 10) % 11; if dv1 = 10 then dv1 := 0; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  dv2 := (s * 10) % 11; if dv2 = 10 then dv2 := 0; end if;
  return dv1 = substr(d, 10, 1)::int and dv2 = substr(d, 11, 1)::int;
end $$;

-- fecha a remessa quando todas as cartas já foram vendidas ou devolvidas
create or replace function public.mk_consign_refresh(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mk_consignments c set status = 'encerrada', updated_at = now()
   where c.id = p_id and c.status = 'recebida'
     and exists (select 1 from public.mk_consign_items i where i.consignment_id = c.id)
     and not exists (select 1 from public.mk_consign_items i where i.consignment_id = c.id and i.status not in ('vendida','devolvida'));
end $$;

create or replace function public.mk_consign_notify_user(p_user uuid, p_title text, p_body text, p_cid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.mk_notify(p_user, 'mk_consign', p_title, left(p_body, 200), jsonb_build_object('mk_consignment_id', p_cid, 'url', '/#cartas'));
end $$;

-- ── 1) usuário registra a remessa (aceita o termo) ───────────────────────────────────────────
create or replace function public.mk_consign_create(
  p_seller uuid, p_items jsonb, p_term_version int, p_accept boolean,
  p_name text, p_doc text, p_phone text, p_pix text, p_carrier text default null, p_tracking text default null)
returns bigint
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  s public.mk_sellers;
  v_term public.mk_consign_terms;
  v_id bigint;
  v_hdr json;
  v_ip text;
  v_ua text;
  e jsonb;
  v_n int := 0;
  v_live boolean;
  v_price numeric;
  v_min numeric;
  v_qty int;
begin
  if v_uid is null then raise exception 'Faça login.'; end if;
  select * into s from public.mk_sellers where id = p_seller;
  if not found or s.status <> 'ativa' then raise exception 'Loja indisponível.'; end if;
  if not s.consign_enabled and not public.mk_is_admin() then raise exception 'A consignação ainda não está liberada.'; end if;
  if coalesce(trim(s.legal_name), '') = '' or coalesce(trim(s.cnpj), '') = '' then
    raise exception 'A loja ainda não informou razão social e CNPJ/CPF para o termo.';
  end if;
  select * into v_term from public.mk_consign_terms order by version desc limit 1;
  if not found then raise exception 'Termo indisponível.'; end if;
  if p_accept is not true or p_term_version is distinct from v_term.version then raise exception 'É preciso aceitar a versão atual do termo.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 5 then raise exception 'Informe seu nome completo.'; end if;
  if not public.mk_valid_cpf(p_doc) then raise exception 'CPF inválido.'; end if;
  if char_length(trim(coalesce(p_pix, ''))) < 5 then raise exception 'Informe a chave Pix para receber o repasse.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Informe de 1 a 100 cartas.';
  end if;
  if (select count(*) from public.mk_consignments where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Muitas remessas hoje. Tente amanhã.';
  end if;

  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  v_ua := left(v_hdr->>'user-agent', 300);

  insert into public.mk_consignments (seller_id, user_id, term_version, accepted_name, accepted_doc, accepted_ip, accepted_ua,
                                      phone, pix_key, commission_pct, carrier, tracking_code, shipped_at)
  values (p_seller, v_uid, v_term.version, left(trim(p_name), 120), regexp_replace(p_doc, '\D', '', 'g'), v_ip, v_ua,
          left(nullif(trim(coalesce(p_phone, '')), ''), 30), left(trim(p_pix), 120), s.consign_commission_pct,
          left(nullif(trim(coalesce(p_carrier, '')), ''), 40), left(nullif(trim(coalesce(p_tracking, '')), ''), 60),
          case when nullif(trim(coalesce(p_tracking, '')), '') is not null then now() end)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_items) loop
    v_price := round((e->>'asking_price')::numeric, 2);
    v_qty := coalesce((e->>'qty')::int, 1);
    v_live := coalesce((e->>'live_auction')::boolean, false);
    v_min := case when v_live then round((e->>'live_min_price')::numeric, 2) end;
    if v_live and (v_min is null or v_min <= 0) then raise exception 'Informe o lance mínimo do leilão para "%".', e->>'name'; end if;
    insert into public.mk_consign_items (consignment_id, seller_id, user_id, name, set_label, card_n, language, condition, qty, asking_price, live_auction, live_min_price)
    values (v_id, p_seller, v_uid, left(trim(e->>'name'), 120), left(nullif(trim(coalesce(e->>'set_label', '')), ''), 80),
            left(nullif(trim(coalesce(e->>'card_n', '')), ''), 20), nullif(e->>'language', ''), nullif(e->>'condition', ''),
            v_qty, v_price, v_live, v_min);
    v_n := v_n + 1;
  end loop;

  perform public.mk_notify_members(p_seller, 'mk_order_new', 'Nova remessa em consignação 📦',
    left(trim(p_name), 60) || ' vai enviar ' || v_n || ' carta(s) em consignação — confirme o recebimento quando chegar.',
    jsonb_build_object('mk_consignment_id', v_id, 'url', '/#mk', 'panel', 'consignacao'));
  return v_id;
end $$;

-- ── 2) usuário: cancelar (antes do recebimento) e atualizar rastreio ─────────────────────────
create or replace function public.mk_consign_cancel(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.mk_consignments;
begin
  select * into c from public.mk_consignments where id = p_id for update;
  if not found or c.user_id <> auth.uid() then raise exception 'Remessa não encontrada.'; end if;
  if c.status <> 'enviada' then raise exception 'Só dá para cancelar antes de a loja confirmar o recebimento.'; end if;
  update public.mk_consignments set status = 'cancelada', updated_at = now() where id = p_id;
  perform public.mk_notify_members(c.seller_id, 'mk_order_new', 'Remessa cancelada', c.accepted_name || ' cancelou a remessa #' || p_id || '.', jsonb_build_object('url', '/#mk', 'panel', 'consignacao'));
  return true;
end $$;

create or replace function public.mk_consign_update_tracking(p_id bigint, p_carrier text, p_tracking text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.mk_consignments;
begin
  select * into c from public.mk_consignments where id = p_id for update;
  if not found or c.user_id <> auth.uid() then raise exception 'Remessa não encontrada.'; end if;
  if c.status <> 'enviada' then raise exception 'A remessa já foi recebida.'; end if;
  update public.mk_consignments set carrier = left(nullif(trim(coalesce(p_carrier, '')), ''), 40),
         tracking_code = left(nullif(trim(coalesce(p_tracking, '')), ''), 60),
         shipped_at = coalesce(shipped_at, now()), updated_at = now() where id = p_id;
  return true;
end $$;

-- ── 3) loja confirma o recebimento: começa o prazo de 30 dias de análise e a responsabilidade é da loja ─────
create or replace function public.mk_consign_receive(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.mk_consignments;
begin
  select * into c from public.mk_consignments where id = p_id for update;
  if not found then raise exception 'Remessa não encontrada.'; end if;
  if not public.mk_is_member(c.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if c.status <> 'enviada' then raise exception 'Esta remessa não está aguardando recebimento (%).', c.status; end if;
  update public.mk_consignments set status = 'recebida', received_at = now(), review_deadline = now() + interval '30 days', updated_at = now() where id = p_id;
  perform public.mk_consign_notify_user(c.user_id, 'Suas cartas chegaram 📬',
    'A Toybox confirmou o recebimento da remessa #' || p_id || '. A partir de agora a guarda das cartas é da loja. Ela tem até 30 dias para analisar.', p_id);
  return true;
end $$;

-- ── 4) loja analisa cada carta: aprovar, recusar ou sugerir outro preço ──────────────────────
create or replace function public.mk_consign_review(p_item bigint, p_action text, p_price numeric default null, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare i public.mk_consign_items; c public.mk_consignments; v_left int;
begin
  select * into i from public.mk_consign_items where id = p_item for update;
  if not found then raise exception 'Carta não encontrada.'; end if;
  if not public.mk_is_member(i.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  select * into c from public.mk_consignments where id = i.consignment_id;
  if c.status <> 'recebida' then raise exception 'A remessa precisa estar recebida.'; end if;
  if i.status not in ('aguardando','sugestao') then raise exception 'Esta carta já foi analisada (%).', i.status; end if;
  if p_action = 'aprovar' then
    update public.mk_consign_items set status = 'aprovada', suggested_price = null, review_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), reviewed_at = now() where id = p_item;
  elsif p_action = 'recusar' then
    if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Informe o motivo da recusa.'; end if;
    update public.mk_consign_items set status = 'recusada', review_note = left(trim(p_note), 300), reviewed_at = now() where id = p_item;
  elsif p_action = 'sugerir' then
    if p_price is null or p_price <= 0 or p_price > 100000 then raise exception 'Informe o preço sugerido.'; end if;
    update public.mk_consign_items set status = 'sugestao', suggested_price = round(p_price, 2), review_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), reviewed_at = now() where id = p_item;
  else raise exception 'Ação inválida.'; end if;

  select count(*) into v_left from public.mk_consign_items where consignment_id = c.id and status = 'aguardando';
  if v_left = 0 then
    perform public.mk_consign_notify_user(c.user_id, 'Análise concluída ✅',
      'A Toybox terminou de analisar a remessa #' || c.id || '. Veja o resultado e responda às sugestões de preço, se houver.', c.id);
  end if;
  return p_action;
end $$;

-- usuário responde a sugestão de preço
create or replace function public.mk_consign_answer(p_item bigint, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare i public.mk_consign_items;
begin
  select * into i from public.mk_consign_items where id = p_item for update;
  if not found or i.user_id <> auth.uid() then raise exception 'Carta não encontrada.'; end if;
  if i.status <> 'sugestao' then raise exception 'Não há sugestão de preço pendente nesta carta.'; end if;
  if p_accept then
    update public.mk_consign_items set status = 'aprovada', asking_price = i.suggested_price, suggested_price = null where id = p_item;
    return 'aprovada';
  end if;
  update public.mk_consign_items set status = 'recusada', review_note = 'Preço sugerido não aceito pelo dono.' where id = p_item;
  return 'recusada';
end $$;

-- usuário muda a opção de leilão ao vivo (cláusula 4.3: enquanto a carta não estiver reservada)
create or replace function public.mk_consign_set_live(p_item bigint, p_live boolean, p_min numeric default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare i public.mk_consign_items;
begin
  select * into i from public.mk_consign_items where id = p_item for update;
  if not found or i.user_id <> auth.uid() then raise exception 'Carta não encontrada.'; end if;
  if i.status not in ('aguardando','sugestao','aprovada','a_venda') then raise exception 'A opção de leilão não pode mais ser alterada (%).', i.status; end if;
  if p_live and (p_min is null or p_min <= 0 or p_min > 100000) then raise exception 'Informe o lance mínimo.'; end if;
  update public.mk_consign_items set live_auction = p_live, live_min_price = case when p_live then round(p_min, 2) end where id = p_item;
  return true;
end $$;

-- ── 5) loja publica a carta aprovada na vitrine (entra como RASCUNHO pra pôr foto e ativar) ─────
create or replace function public.mk_consign_publish(p_item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare i public.mk_consign_items; v_pid bigint; v_desc text;
begin
  select * into i from public.mk_consign_items where id = p_item for update;
  if not found then raise exception 'Carta não encontrada.'; end if;
  if not public.mk_is_member(i.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if i.status <> 'aprovada' then raise exception 'Só carta aprovada pode ser publicada (%).', i.status; end if;
  v_desc := 'Carta em consignação.' || case when i.card_n is not null then ' Nº ' || i.card_n || '.' else '' end || case when i.set_label is not null then ' Coleção: ' || i.set_label || '.' else '' end;
  insert into public.mk_products (seller_id, kind, title, description, sku, card_n, condition, language, price, status, created_by, consign_item_id)
  values (i.seller_id, 'carta', i.name, v_desc, 'CS-' || i.id, i.card_n, i.condition, i.language, i.asking_price, 'rascunho', auth.uid(), i.id)
  returning id into v_pid;
  update public.mk_stock set qty_available = i.qty - i.qty_sold, updated_at = now() where product_id = v_pid;
  insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note)
  values (v_pid, i.seller_id, i.qty - i.qty_sold, i.qty - i.qty_sold, 'inicial', 'Consignação #' || i.consignment_id);
  update public.mk_consign_items set status = 'a_venda', product_id = v_pid where id = p_item;
  return v_pid;
end $$;

-- ── 6) loja marca vendida (total ou parcial): baixa o estoque e guarda o valor pro repasse ────────
create or replace function public.mk_consign_mark_sold(p_item bigint, p_qty int, p_unit_price numeric) returns text
language plpgsql security definer set search_path = public as $$
declare i public.mk_consign_items; v_row public.mk_stock; v_new int;
begin
  select * into i from public.mk_consign_items where id = p_item for update;
  if not found then raise exception 'Carta não encontrada.'; end if;
  if not public.mk_is_member(i.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if i.status <> 'a_venda' then raise exception 'A carta não está à venda (%).', i.status; end if;
  if p_qty is null or p_qty < 1 or p_qty > i.qty - i.qty_sold then raise exception 'Quantidade inválida: restam % para vender.', i.qty - i.qty_sold; end if;
  if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 100000 then raise exception 'Informe o preço de venda.'; end if;
  if p_unit_price < coalesce(case when i.live_auction then least(i.live_min_price, i.asking_price) end, i.asking_price) then
    raise exception 'O valor está abaixo do preço combinado com o dono (R$ %).', i.asking_price;
  end if;
  if i.product_id is not null then
    select * into v_row from public.mk_stock where product_id = i.product_id for update;
    v_new := coalesce(v_row.qty_available, 0) - p_qty;
    if v_new < 0 then raise exception 'Estoque da vitrine menor que a quantidade vendida. Ajuste o estoque do produto antes.'; end if;
    update public.mk_stock set qty_available = v_new, updated_at = now() where product_id = i.product_id;
    insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note)
    values (i.product_id, i.seller_id, -p_qty, v_new, 'venda', 'Consignação #' || i.consignment_id || ' (item ' || i.id || ')');
  end if;
  update public.mk_consign_items set qty_sold = qty_sold + p_qty, sold_total = sold_total + round(p_qty * p_unit_price, 2), sold_at = now(),
         status = case when qty_sold + p_qty >= qty then 'vendida' else status end where id = p_item;
  if i.qty_sold + p_qty >= i.qty and i.product_id is not null then
    update public.mk_products set status = 'arquivado' where id = i.product_id;
  end if;
  perform public.mk_consign_notify_user(i.user_id, 'Carta vendida 🎉', p_qty || '× ' || i.name || ' vendida por R$ ' || replace(to_char(p_unit_price, 'FM999990.00'), '.', ',') || '. O repasse segue o termo.', i.consignment_id);
  perform public.mk_consign_refresh(i.consignment_id);
  return case when i.qty_sold + p_qty >= i.qty then 'vendida' else 'a_venda' end;
end $$;

-- ── 7) devolução: o dono pede, a loja informa o frete, o dono paga, a loja confirma e envia ─────────
create or replace function public.mk_consign_return_request(p_consignment bigint, p_items bigint[], p_address text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  c public.mk_consignments; v_uid uuid := auth.uid(); v_id bigint; i public.mk_consign_items; v_row public.mk_stock; v_member boolean;
begin
  select * into c from public.mk_consignments where id = p_consignment for update;
  if not found then raise exception 'Remessa não encontrada.'; end if;
  v_member := public.mk_is_member(c.seller_id);
  if v_uid is null or (c.user_id <> v_uid and not v_member) then raise exception 'Remessa não encontrada.'; end if;
  if c.status <> 'recebida' then raise exception 'A devolução só vale depois de a loja receber as cartas.'; end if;
  if p_items is null or array_length(p_items, 1) is null or array_length(p_items, 1) > 100 then raise exception 'Escolha as cartas a devolver.'; end if;
  if char_length(trim(coalesce(p_address, ''))) < 10 then raise exception 'Informe o endereço completo para a entrega.'; end if;

  insert into public.mk_consign_returns (consignment_id, seller_id, user_id, address, requested_by)
  values (c.id, c.seller_id, c.user_id, left(trim(p_address), 400), v_uid) returning id into v_id;

  for i in select * from public.mk_consign_items where id = any(p_items) and consignment_id = c.id order by id for update loop
    if i.status not in ('aguardando','sugestao','aprovada','recusada','a_venda') then
      raise exception 'A carta "%" não pode ser devolvida agora (%).', i.name, i.status;
    end if;
    if i.status = 'a_venda' and i.product_id is not null then
      select * into v_row from public.mk_stock where product_id = i.product_id for update;
      if v_row.qty_reserved > 0 or v_row.qty_available < i.qty - i.qty_sold then
        raise exception 'A carta "%" está reservada ou já saiu do estoque: não dá para devolver.', i.name;
      end if;
      update public.mk_products set status = 'pausado' where id = i.product_id;
    end if;
    update public.mk_consign_items set status_before_return = i.status, status = 'devolucao', return_id = v_id where id = i.id;
  end loop;
  if not exists (select 1 from public.mk_consign_items where return_id = v_id) then raise exception 'Nenhuma das cartas escolhidas pode ser devolvida.'; end if;

  if v_member and c.user_id <> v_uid then
    perform public.mk_consign_notify_user(c.user_id, 'Devolução de cartas aberta 📮', 'A Toybox abriu a devolução #' || v_id || '. Você receberá o valor do frete para pagar antes do envio.', c.id);
  else
    perform public.mk_notify_members(c.seller_id, 'mk_order_new', 'Pedido de devolução 📮', c.accepted_name || ' pediu as cartas de volta (remessa #' || c.id || '). Informe o valor do frete.',
      jsonb_build_object('url', '/#mk', 'panel', 'consignacao'));
  end if;
  return v_id;
end $$;

create or replace function public.mk_consign_return_quote(p_return bigint, p_freight numeric, p_note text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.mk_consign_returns;
begin
  select * into r from public.mk_consign_returns where id = p_return for update;
  if not found then raise exception 'Devolução não encontrada.'; end if;
  if not public.mk_is_member(r.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if r.status not in ('pedida','frete_informado') then raise exception 'O frete desta devolução já foi pago ou ela foi encerrada.'; end if;
  if p_freight is null or p_freight < 0 or p_freight > 5000 then raise exception 'Informe o valor do frete.'; end if;
  update public.mk_consign_returns set status = 'frete_informado', freight_amount = round(p_freight, 2),
         freight_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), updated_at = now() where id = p_return;
  perform public.mk_consign_notify_user(r.user_id, 'Frete da devolução: R$ ' || replace(to_char(p_freight, 'FM999990.00'), '.', ','),
    'Pague o frete combinando com a Toybox pelo WhatsApp. Ela envia as cartas assim que confirmar o pagamento.', r.consignment_id);
  return true;
end $$;

create or replace function public.mk_consign_return_paid(p_return bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.mk_consign_returns;
begin
  select * into r from public.mk_consign_returns where id = p_return for update;
  if not found then raise exception 'Devolução não encontrada.'; end if;
  if not public.mk_is_member(r.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if r.status <> 'frete_informado' then raise exception 'Informe o valor do frete antes de confirmar o pagamento.'; end if;
  update public.mk_consign_returns set status = 'frete_pago', freight_paid_at = now(), updated_at = now() where id = p_return;
  return true;
end $$;

create or replace function public.mk_consign_return_ship(p_return bigint, p_carrier text, p_tracking text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.mk_consign_returns; i record; v_row public.mk_stock;
begin
  select * into r from public.mk_consign_returns where id = p_return for update;
  if not found then raise exception 'Devolução não encontrada.'; end if;
  if not public.mk_is_member(r.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if r.status <> 'frete_pago' then raise exception 'O envio só é liberado depois de confirmar o pagamento do frete.'; end if;
  if char_length(trim(coalesce(p_tracking, ''))) < 4 then raise exception 'Informe o código de rastreio.'; end if;
  for i in select * from public.mk_consign_items where return_id = p_return for update loop
    if i.product_id is not null then
      select * into v_row from public.mk_stock where product_id = i.product_id for update;
      if coalesce(v_row.qty_available, 0) > 0 then
        insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note)
        values (i.product_id, i.seller_id, -v_row.qty_available, 0, 'ajuste', 'Devolução ao dono (consignação #' || i.consignment_id || ')');
        update public.mk_stock set qty_available = 0, updated_at = now() where product_id = i.product_id;
      end if;
      update public.mk_products set status = 'arquivado' where id = i.product_id;
    end if;
    update public.mk_consign_items set status = 'devolvida' where id = i.id;
  end loop;
  update public.mk_consign_returns set status = 'enviada', carrier = left(nullif(trim(coalesce(p_carrier, '')), ''), 40),
         tracking_code = left(trim(p_tracking), 60), shipped_at = now(), updated_at = now() where id = p_return;
  perform public.mk_consign_notify_user(r.user_id, 'Suas cartas foram enviadas 📦', 'Rastreio: ' || trim(p_tracking) || '.', r.consignment_id);
  perform public.mk_consign_refresh(r.consignment_id);
  return true;
end $$;

-- cancelar a devolução (antes de o frete ser pago): as cartas voltam ao estado anterior
create or replace function public.mk_consign_return_cancel(p_return bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.mk_consign_returns; i record;
begin
  select * into r from public.mk_consign_returns where id = p_return for update;
  if not found then raise exception 'Devolução não encontrada.'; end if;
  if r.user_id <> auth.uid() and not public.mk_is_member(r.seller_id) then raise exception 'Devolução não encontrada.'; end if;
  if r.status not in ('pedida','frete_informado') then raise exception 'Depois de pago o frete, a devolução não pode mais ser cancelada.'; end if;
  for i in select * from public.mk_consign_items where return_id = p_return for update loop
    if i.status_before_return = 'a_venda' and i.product_id is not null then
      update public.mk_products set status = 'ativo' where id = i.product_id and status = 'pausado';
    end if;
    update public.mk_consign_items set status = coalesce(i.status_before_return, 'aprovada'), status_before_return = null, return_id = null where id = i.id;
  end loop;
  update public.mk_consign_returns set status = 'cancelada', updated_at = now() where id = p_return;
  return true;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'mk_consign_create(uuid,jsonb,int,boolean,text,text,text,text,text,text)', 'mk_consign_cancel(bigint)', 'mk_consign_update_tracking(bigint,text,text)',
    'mk_consign_receive(bigint)', 'mk_consign_review(bigint,text,numeric,text)', 'mk_consign_answer(bigint,boolean)', 'mk_consign_set_live(bigint,boolean,numeric)',
    'mk_consign_publish(bigint)', 'mk_consign_mark_sold(bigint,int,numeric)', 'mk_consign_return_request(bigint,bigint[],text)',
    'mk_consign_return_quote(bigint,numeric,text)', 'mk_consign_return_paid(bigint)', 'mk_consign_return_ship(bigint,text,text)', 'mk_consign_return_cancel(bigint)']
  loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;
revoke all on function public.mk_consign_refresh(bigint) from public, anon, authenticated;
revoke all on function public.mk_consign_notify_user(uuid,text,text,bigint) from public, anon, authenticated;
revoke all on function public.mk_valid_cpf(text) from public, anon;
grant execute on function public.mk_valid_cpf(text) to authenticated;

-- ── termo v1 (rascunho: ainda vai passar por advogado; por isso a consignação nasce desligada) ───────────────
insert into public.mk_consign_terms (version, title, body, draft) values (1, 'Termo de Consignação — Toybox no MyDeck', $term$
## 1. Partes

**Consignante (você):** o usuário do MyDeck que envia as cartas, identificado no aceite por nome completo, CPF, telefone e chave Pix.

**Consignatária:** {{LOJA}}, CPF/CNPJ {{CNPJ}}, que opera a loja **Toybox**.

**MyDeck:** é só a plataforma digital que registra a remessa, este aceite e o acompanhamento. O MyDeck não recebe as cartas, não recebe dinheiro de compradores e não é parte da venda.

## 2. Objeto e entrega

**2.1** Você entrega à Toybox as cartas da remessa registrada no MyDeck (nome, coleção, número, idioma, estado, quantidade e preço pedido por carta) para que ela as venda em nome próprio, por sua conta.

**2.2** O envio até a Toybox é por **sua conta e risco**: use transporte com rastreio e embalagem adequada (sleeves, toploaders e caixa rígida). Extravio ou dano **durante o transporte, até o recebimento**, ficam com você.

**2.3** A Toybox confirma o recebimento no MyDeck e você é avisado.

**2.4** **A partir da confirmação do recebimento, a guarda e a responsabilidade pelas cartas são da Toybox.** Em caso de perda, extravio, furto ou dano enquanto as cartas estiverem com ela, a Toybox paga o preço combinado de cada carta, descontada a comissão que seria devida.

## 3. Análise, preço e comissão

**3.1** A Toybox tem **30 dias corridos** a partir do recebimento para analisar as cartas. Para cada uma ela **aprova**, **recusa** (falsa, fora do estado declarado ou que não seja Pokémon TCG, com motivo) ou **sugere outro preço**, que só vale se você aceitar no MyDeck.

**3.2** Cartas recusadas ficam à sua disposição para devolução, nas condições da cláusula 6. Cartas suspeitas de falsificação não são colocadas à venda.

**3.3** O preço é definido por você. A Toybox não vende abaixo dele sem a sua autorização registrada no MyDeck.

**3.4** A Toybox retém **{{COMISSAO}}%** do valor recebido de cada carta vendida. Carta não vendida não gera cobrança.

## 4. Canais de venda e leilão ao vivo

**4.1** As cartas aprovadas podem ser vendidas na loja Toybox no MyDeck, pelo WhatsApp da loja e em outros canais da Toybox.

**4.2** **Leilão ao vivo (opcional).** Ao registrar a remessa você marca, carta a carta, se **autoriza ou não** que ela seja leiloada na live da Toybox. Se autorizar, informa o **lance mínimo**, e a venda por leilão não pode ficar abaixo dele. Se não autorizar, a carta só é vendida pelo preço fixo.

**4.3** Você pode mudar essa opção enquanto a carta não estiver reservada para uma live. Carta já anunciada numa live agendada não sai dela.

**4.4** Carta vendida (preço fixo ou leilão) não pode mais ser retirada, e o valor entra no repasse.

## 5. Prazo e repasse

**5.1** A consignação vale por **90 dias** a partir do recebimento e **se renova automaticamente, por períodos iguais, enquanto você não pedir as cartas de volta**.

**5.2** A Toybox repassa o valor de cada carta vendida, menos a comissão, por Pix para a chave que você informou, em até **7 dias úteis depois da entrega da carta ao comprador** (prazo do direito de arrependimento da compra à distância, art. 49 do CDC). A cada repasse ela envia o extrato com carta, valor bruto, comissão e valor líquido.

## 6. Devolução das cartas (restituição)

**6.1** Você pode pedir de volta, a qualquer momento, as cartas ainda não vendidas, e a Toybox deve devolver as cartas recusadas na análise.

**6.2** Como funciona: (1) você faz o pedido no MyDeck com o endereço de entrega; (2) a Toybox informa o **valor do frete de volta**; (3) **você paga o frete antes do envio**; (4) a Toybox envia as cartas com rastreio e embalagem adequada, depois de confirmar o pagamento.

**6.3** Cartas **vendidas ou reservadas para um comprador**, ou já incluídas numa live agendada, não podem ser retiradas.

**6.4** Depois da postagem, o risco do transporte de volta é seu.

## 7. Declarações e demais condições

**7.1** Você declara ser maior de 18 anos, dono legítimo das cartas, que elas são autênticas e que o estado informado é verdadeiro. Cartas falsificadas ou de origem ilícita são recusadas.

**7.2** Se o comprador exercer o direito de arrependimento ou houver defeito comprovado, a venda é desfeita: a carta volta à Toybox, o repasse correspondente é cancelado (ou compensado no próximo) e a carta volta a ser vendida em consignação.

**7.3** **Dados pessoais (LGPD).** Seus dados (nome, CPF, contato, chave Pix e endereço, quando houver devolução) são usados só para executar esta consignação, fazer os repasses e cumprir obrigações legais, e compartilhados apenas com a Toybox e com prestadores de pagamento e frete.

**7.4** Cada parte cuida das suas obrigações fiscais.

**7.5** O MyDeck não é depositante, comprador, vendedor nem garantidor. Problemas de entrega, análise, repasse ou devolução se resolvem entre você e a Toybox; o MyDeck só guarda o histórico.

**7.6** **Aceite eletrônico.** Ao marcar a caixa de aceite você concorda com este termo. O sistema guarda a versão, a data e hora, o IP, seu usuário e nome e a lista da remessa. Mudanças no termo valem apenas para remessas novas.

**7.7** Você ou a Toybox podem encerrar a consignação avisando pelo MyDeck. Cartas vendidas seguem o repasse e as não vendidas seguem a cláusula 6.
$term$, true)
on conflict (version) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════
-- Complementos aplicados em seguida (mk_consignacao_endereco_privado / mk_consignacao_exige_endereco)
-- Endereço para receber as cartas NÃO fica em mk_sellers (público): fica em mk_seller_private e só chega a quem registrou remessa.
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.mk_seller_private (
  seller_id uuid primary key references public.mk_sellers(id) on delete cascade,
  consign_receiver text,
  consign_address text,
  updated_at timestamptz not null default now()
);
alter table public.mk_seller_private enable row level security;
drop policy if exists mk_seller_private_select on public.mk_seller_private;
create policy mk_seller_private_select on public.mk_seller_private for select to authenticated using (public.mk_is_member(seller_id));
drop policy if exists mk_seller_private_insert on public.mk_seller_private;
create policy mk_seller_private_insert on public.mk_seller_private for insert to authenticated with check (public.mk_is_member(seller_id));
drop policy if exists mk_seller_private_update on public.mk_seller_private;
create policy mk_seller_private_update on public.mk_seller_private for update to authenticated using (public.mk_is_member(seller_id)) with check (public.mk_is_member(seller_id));
revoke all on public.mk_seller_private from anon, authenticated;
grant select, insert, update on public.mk_seller_private to authenticated;

create or replace function public.mk_consign_ship_info(p_consignment bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.mk_consignments; p public.mk_seller_private;
begin
  select * into c from public.mk_consignments where id = p_consignment;
  if not found or (c.user_id <> auth.uid() and not public.mk_is_member(c.seller_id)) then raise exception 'Remessa não encontrada.'; end if;
  select * into p from public.mk_seller_private where seller_id = c.seller_id;
  return jsonb_build_object('receiver', p.consign_receiver, 'address', p.consign_address);
end $$;
revoke all on function public.mk_consign_ship_info(bigint) from public, anon;
grant execute on function public.mk_consign_ship_info(bigint) to authenticated;

create or replace function public.mk_consign_has_address(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mk_seller_private where seller_id = p_seller and char_length(trim(coalesce(consign_address, ''))) >= 10);
$$;
revoke all on function public.mk_consign_has_address(uuid) from public, anon;
grant execute on function public.mk_consign_has_address(uuid) to authenticated;

-- e mk_consign_create ganhou, logo depois do teste de razão social/CNPJ:
--   if not public.mk_consign_has_address(p_seller) then raise exception 'A loja ainda não cadastrou o endereço para receber as cartas.'; end if;

-- ── 23/10/2026: busca de carta no formulário guarda a coleção do catálogo (set_id) ──────────────────────
-- mk_consign_items.set_id (aplicado como migration mk_consignacao_set_id): mk_consign_create grava e mk_consign_publish
-- passa pro produto (mk_products.set_id), assim a carta publicada já nasce ligada à coleção na vitrine.
alter table public.mk_consign_items add column if not exists set_id text check (set_id is null or char_length(set_id) <= 30);
