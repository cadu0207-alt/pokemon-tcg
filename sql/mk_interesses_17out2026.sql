-- ════════════════════════════════════════════════════════════════════════════════
-- Loja (Toybox) — INTERESSE via WhatsApp (17/10/2026)
-- Pedido do Eduardo: clicar em "Chamar a loja no WhatsApp" (produto ou carrinho) NÃO cria pedido nem mexe no estoque.
-- Registra um INTERESSE que vale 2 horas e avisa a equipe. Quando o lojista fecha a venda no WhatsApp, ele marca o
-- interesse como VENDIDO e só então o estoque baixa (movimento 'venda' em mk_stock_moves).
--   • Só quem está logado gera interesse (precisamos saber quem é); visitante só abre o WhatsApp, como antes.
--   • Preço/título vêm do banco, nunca do navegador. Sem reserva de estoque.
--   • Mesmo carrinho clicado de novo dentro de 2 h = mesmo interesse (não gera aviso repetido).
-- ════════════════════════════════════════════════════════════════════════════════

create table if not exists public.mk_interests (
  id bigint generated always as identity primary key,
  seller_id uuid not null references public.mk_sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null check (char_length(buyer_name) between 1 and 80),
  buyer_email text,
  items jsonb not null,
  items_key text not null,
  total numeric(10,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto','vendido','cancelado')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  sold_at timestamptz,
  sold_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists mk_interests_seller_idx on public.mk_interests (seller_id, status, created_at desc);
create index if not exists mk_interests_user_idx on public.mk_interests (user_id, created_at desc);

alter table public.mk_interests enable row level security;
drop policy if exists mk_interests_select on public.mk_interests;
create policy mk_interests_select on public.mk_interests for select to authenticated using (public.mk_is_member(seller_id));
revoke all on public.mk_interests from anon, authenticated;
grant select on public.mk_interests to authenticated;

-- ── registrar interesse (chamado quando o cliente logado clica no WhatsApp) ─────────────────
create or replace function public.mk_register_interest(p_seller uuid, p_items jsonb, p_name text default null)
returns bigint
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_key text;
  v_items jsonb;
  v_total numeric(10,2);
  v_id bigint;
  v_summary text;
begin
  if v_uid is null then raise exception 'Faça login.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Itens inválidos.';
  end if;
  if not exists (select 1 from public.mk_sellers s where s.id = p_seller and s.status = 'ativa') then
    raise exception 'Loja indisponível.';
  end if;
  if (select count(*) from public.mk_interests where user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas solicitações seguidas. Aguarde um pouco.';
  end if;

  -- preço e título vêm do banco; quantidade limitada a 1..100; produto repetido soma
  with req as (
    select (e->>'product_id')::bigint as pid, least(greatest(coalesce((e->>'qty')::int, 1), 1), 100) as q
    from jsonb_array_elements(p_items) e
    where (e->>'product_id') ~ '^[0-9]+$'
  ), agg as (
    select pid, least(sum(q), 100)::int as q from req group by pid
  ), good as (
    select p.id, p.title, p.price, a.q
    from agg a join public.mk_products p on p.id = a.pid and p.seller_id = p_seller and p.status = 'ativo'
  )
  select jsonb_agg(jsonb_build_object('product_id', id, 'title', title, 'unit_price', price, 'qty', q) order by id),
         coalesce(sum(price * q), 0),
         string_agg(id || 'x' || q, ',' order by id),
         string_agg(q || '× ' || title, '; ' order by id)
    into v_items, v_total, v_key, v_summary
    from good;
  if v_items is null then raise exception 'Nenhum dos produtos está disponível.'; end if;

  select email into v_email from auth.users where id = v_uid;
  v_name := left(coalesce(nullif(trim(p_name), ''), split_part(coalesce(v_email, ''), '@', 1), 'Cliente'), 80);
  if v_name = '' then v_name := 'Cliente'; end if;

  -- mesmo conjunto de itens ainda dentro das 2 h = mesmo interesse
  select id into v_id from public.mk_interests
   where user_id = v_uid and seller_id = p_seller and status = 'aberto' and items_key = v_key and expires_at > now()
   order by id desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.mk_interests (seller_id, user_id, buyer_name, buyer_email, items, items_key, total)
  values (p_seller, v_uid, v_name, v_email, v_items, v_key, v_total)
  returning id into v_id;

  perform public.mk_notify_members(p_seller, 'mk_order_new', 'Novo interesse via WhatsApp 💬',
    left(v_name || ' quer: ' || v_summary, 180) || ' · R$ ' || replace(to_char(v_total, 'FM999990.00'), '.', ','),
    jsonb_build_object('mk_interest_id', v_id, 'url', '/#mk'));
  return v_id;
end $$;

-- ── lojista marca como VENDIDO: aqui (e só aqui) o estoque baixa ─────────────────────────────
create or replace function public.mk_interest_sell(p_interest bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.mk_interests;
  it record;
  v_row public.mk_stock;
begin
  select * into v from public.mk_interests where id = p_interest for update;
  if not found then raise exception 'Interesse não encontrado.'; end if;
  if not public.mk_is_member(v.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if v.status <> 'aberto' then raise exception 'Este interesse já foi encerrado (%).', v.status; end if;

  -- 1) confere o estoque de TODOS os itens antes de baixar qualquer um (ordem fixa evita deadlock)
  for it in select (e->>'product_id')::bigint as pid, (e->>'qty')::int as q, e->>'title' as title
              from jsonb_array_elements(v.items) e order by (e->>'product_id')::bigint loop
    select * into v_row from public.mk_stock where product_id = it.pid for update;
    if not found or v_row.qty_available < it.q then
      raise exception 'Estoque insuficiente de "%": há % disponível(is) e a venda é de %.', it.title, coalesce(v_row.qty_available, 0), it.q;
    end if;
  end loop;

  -- 2) baixa e registra o movimento
  for it in select (e->>'product_id')::bigint as pid, (e->>'qty')::int as q
              from jsonb_array_elements(v.items) e order by (e->>'product_id')::bigint loop
    update public.mk_stock set qty_available = qty_available - it.q, updated_at = now()
     where product_id = it.pid returning * into v_row;
    insert into public.mk_stock_moves (product_id, seller_id, delta, qty_after, kind, note)
    values (it.pid, v.seller_id, -it.q, v_row.qty_available, 'venda', left('Venda via WhatsApp (interesse #' || v.id || ' · ' || v.buyer_name || ')', 200));
  end loop;

  update public.mk_interests set status = 'vendido', sold_at = now(), sold_by = auth.uid() where id = p_interest;
  return jsonb_build_object('ok', true, 'id', p_interest);
end $$;

-- ── lojista descarta o interesse (não vendeu) ───────────────────────────────────────────────
create or replace function public.mk_interest_cancel(p_interest bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v public.mk_interests;
begin
  select * into v from public.mk_interests where id = p_interest for update;
  if not found then raise exception 'Interesse não encontrado.'; end if;
  if not public.mk_is_member(v.seller_id) then raise exception 'Você não faz parte desta loja.'; end if;
  if v.status <> 'aberto' then return false; end if;
  update public.mk_interests set status = 'cancelado' where id = p_interest;
  return true;
end $$;

revoke all on function public.mk_register_interest(uuid, jsonb, text) from public, anon;
revoke all on function public.mk_interest_sell(bigint) from public, anon;
revoke all on function public.mk_interest_cancel(bigint) from public, anon;
grant execute on function public.mk_register_interest(uuid, jsonb, text) to authenticated;
grant execute on function public.mk_interest_sell(bigint) to authenticated;
grant execute on function public.mk_interest_cancel(bigint) to authenticated;
