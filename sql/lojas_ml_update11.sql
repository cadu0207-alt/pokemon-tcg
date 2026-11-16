-- ================================================================
-- MyDeck — MINI DASHBOARD ADMIN · Update 11
-- Adiciona: data do último cadastro, data da última carta coletada,
-- e uma tabela de "visitas" pra alimentar um gráfico de uso diário
-- (acessos x cadastros) no Dashboard do admin.
--
-- Rode DEPOIS do lojas_ml_update9.sql (esse update SUBSTITUI a função
-- admin_dashboard_stats criada lá, adicionando os 2 campos novos).
-- ================================================================

-- 1) Tabela de visitas — 1 linha por usuário por dia (upsert), gravada
-- automaticamente quando um usuário logado abre o site. Não conta
-- visitantes anônimos (não logados), só uso real da conta.
create table if not exists site_visits (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  visit_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, visit_date)
);

alter table site_visits enable row level security;

drop policy if exists "own_visit_insert" on site_visits;
create policy "own_visit_insert" on site_visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_visit_select" on site_visits;
create policy "own_visit_select" on site_visits
  for select using (auth.uid() = user_id);

-- 2) admin_dashboard_stats — recriada com os 2 campos novos
-- (last_signup_at, last_card_at) além de tudo que já existia.
create or replace function admin_dashboard_stats()
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
    'total_users', (select count(*) from auth.users),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_users', (select count(distinct user_id) from collection),
    'total_cards_collected', (select count(*) from collection),
    'total_purchases', (select count(*) from purchases),
    'tracked_products', (select count(*) from ml_search_terms where active = true),
    'last_signup_at', (select max(created_at) from auth.users),
    'last_card_at', (select max(marked_at) from collection)
  ) into result;

  return result;
end;
$$;

grant execute on function admin_dashboard_stats() to authenticated;

-- 3) admin_usage_timeline — série diária de acessos x cadastros dos
-- últimos N dias (padrão 30), pra montar o gráfico de linhas.
create or replace function admin_usage_timeline(days int default 30)
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

  select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json)
  into result
  from (
    select
      d::date as day,
      (select count(*) from site_visits sv where sv.visit_date = d::date) as visits,
      (select count(*) from auth.users u where u.created_at::date = d::date) as signups
    from generate_series(
      current_date - ((coalesce(days, 30) - 1) * interval '1 day'),
      current_date,
      interval '1 day'
    ) d
  ) t;

  return result;
end;
$$;

grant execute on function admin_usage_timeline(int) to authenticated;
