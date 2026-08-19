-- ================================================================
-- MyDeck — MÉTRICAS DE USO (analytics_setup.sql)
-- Pedido do Eduardo (11/08/2026): saber qual parte do site é mais
-- acessada, qual produto rastreado mais recebe clique pro Mercado
-- Livre (e o total geral de cliques pro ML), quem são os usuários
-- mais ativos, e qual coleção mais gente está montando.
--
-- Mesmo padrão de segurança já usado em site_visits/admin_dashboard_stats:
--   - tabelas de evento: RLS, cada usuário só insere/lê a própria linha
--   - agregados: função security definer que confere auth.uid() = Eduardo
--     por dentro (funciona mesmo se alguém tentar chamar pelo console)
--
-- Rode isso inteiro no SQL Editor do Supabase.
-- ================================================================

-- 1) tab_visits — 1 linha por usuário/aba/dia (upsert), grava toda vez
-- que o usuário troca de aba (go() em app.js). Mesma lógica do
-- site_visits, mas por aba em vez de só "entrou no site".
create table if not exists tab_visits (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  tab_id text not null,
  visit_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, tab_id, visit_date)
);

alter table tab_visits enable row level security;

drop policy if exists "own_tab_visit_insert" on tab_visits;
create policy "own_tab_visit_insert" on tab_visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_tab_visit_update" on tab_visits;
create policy "own_tab_visit_update" on tab_visits
  for update using (auth.uid() = user_id);

drop policy if exists "own_tab_visit_select" on tab_visits;
create policy "own_tab_visit_select" on tab_visits
  for select using (auth.uid() = user_id);

-- 2) ml_product_redirects — 1 linha POR CLIQUE (sem upsert/dedupe —
-- cada clique no card do produto conta) em "ver oferta"/comprar de um
-- produto rastreado do Mercado Livre (lojas.js/renderProductCard).
-- RENOMEADA de ml_product_clicks em 19/08/2026: bloqueadores de
-- anúncio/privacidade (uBlock, AdGuard, Brave Shields etc.) derrubam
-- qualquer requisição de rede cuja URL contenha a palavra "click" —
-- e o endpoint do Supabase é literalmente /rest/v1/ml_product_clicks,
-- então o insert nem saía do navegador (0 cliques registrados mesmo
-- com cliques reais). Ver rename_clicks_to_redirects.sql.
create table if not exists ml_product_redirects (
  id bigint generated always as identity primary key,
  term_id bigint references ml_search_terms(id) on delete set null,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table ml_product_redirects enable row level security;

drop policy if exists "own_product_redirect_insert" on ml_product_redirects;
create policy "own_product_redirect_insert" on ml_product_redirects
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_product_redirect_select" on ml_product_redirects;
create policy "own_product_redirect_select" on ml_product_redirects
  for select using (auth.uid() = user_id);

-- 3) admin_tab_stats — ranking de abas mais acessadas (total e nos
-- últimos N dias, padrão 30).
create or replace function admin_tab_stats(days int default 30)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.total desc), '[]'::json)
  into result
  from (
    select
      tab_id,
      count(*) as total,
      count(*) filter (where visit_date > current_date - (coalesce(days, 30) * interval '1 day')) as recent,
      count(distinct user_id) as unique_users
    from tab_visits
    group by tab_id
  ) t;

  return result;
end;
$$;

grant execute on function admin_tab_stats(int) to authenticated;

-- 4) admin_product_redirect_stats — ranking de produtos mais clicados
-- rumo ao Mercado Livre, + total geral de cliques (todos os produtos
-- somados) e total nos últimos N dias.
-- RENOMEADA de admin_product_click_stats em 19/08/2026 (mesmo motivo
-- do item 2 — a RPC também é chamada via URL /rest/v1/rpc/..., que
-- também cai no filtro de bloqueadores por conter "click").
create or replace function admin_product_redirect_stats(days int default 30)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'total_clicks', (select count(*) from ml_product_redirects),
    'total_clicks_recent', (select count(*) from ml_product_redirects where created_at > now() - (coalesce(days, 30) * interval '1 day')),
    'items', (
      select coalesce(json_agg(row_to_json(t) order by t.clicks desc), '[]'::json)
      from (
        select
          c.term_id,
          coalesce(st.label, st.term, 'produto removido') as label,
          st.collection,
          count(*) as clicks,
          count(*) filter (where c.created_at > now() - (coalesce(days, 30) * interval '1 day')) as clicks_recent
        from ml_product_redirects c
        left join ml_search_terms st on st.id = c.term_id
        group by c.term_id, st.label, st.term, st.collection
      ) t
    )
  ) into result;

  return result;
end;
$$;

grant execute on function admin_product_redirect_stats(int) to authenticated;

-- 5) admin_list_users — lista de usuários com atividade (pra achar
-- quem tá mais engajado, ou contas fantasmas que nunca voltaram).
create or replace function admin_list_users()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.last_seen desc nulls last), '[]'::json)
  into result
  from (
    select
      u.id as user_id,
      u.email,
      u.created_at as signed_up_at,
      (select max(sv.visit_date) from site_visits sv where sv.user_id = u.id) as last_seen,
      (select count(*) from collection c where c.user_id = u.id) as cards_collected,
      (select count(*) from purchases p where p.user_id = u.id) as purchases_count
    from auth.users u
  ) t;

  return result;
end;
$$;

grant execute on function admin_list_users() to authenticated;

-- 6) admin_set_distribution — quantos usuários distintos e quantas
-- cartas por coleção (set), pra ver qual Master Set o pessoal mais tá
-- montando.
-- CORRIGIDO 13/08/2026: a tabela collection NÃO tem coluna "set" — o
-- schema real usa slot_key no formato "{set}:{card_n}:{versao}" (ver
-- slotKey() em app.js). O set é o primeiro pedaço antes do ":".
create or replace function admin_set_distribution()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.collectors desc), '[]'::json)
  into result
  from (
    select
      split_part(slot_key, ':', 1) as set_id,
      count(distinct user_id) as collectors,
      count(*) as cards_marked
    from collection
    group by split_part(slot_key, ':', 1)
  ) t;

  return result;
end;
$$;

grant execute on function admin_set_distribution() to authenticated;
