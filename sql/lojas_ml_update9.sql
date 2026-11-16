-- ================================================================
-- MyDeck — MINI DASHBOARD ADMIN · Update 9
-- Função que devolve estatísticas de uso (cadastros, usuários ativos,
-- cartas coletadas, produtos rastreados) direto pro admin ver no site,
-- sem precisar abrir o SQL Editor toda vez.
--
-- Segurança: a função confere DENTRO dela mesma se quem está chamando
-- é a conta do Eduardo (auth.uid()) — mesmo se alguém tentar chamar
-- essa função pelo console do navegador, só funciona logado como admin.
-- ================================================================

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
    'tracked_products', (select count(*) from ml_search_terms where active = true)
  ) into result;

  return result;
end;
$$;

-- Permite que qualquer usuário autenticado TENTE chamar a função — mas
-- a checagem de admin.uid() lá dentro bloqueia todo mundo que não for
-- o Eduardo (retorna erro "not authorized").
grant execute on function admin_dashboard_stats() to authenticated;
