-- ================================================================
-- MyDeck — Renomeia ml_product_clicks → ml_product_redirects
-- (19/08/2026) Causa raiz do "cliques rumo ao ML sempre zerado":
-- bloqueadores de anúncio/privacidade (uBlock, AdGuard, Brave Shields
-- etc.) usam listas de filtro que derrubam QUALQUER requisição de rede
-- cuja URL contenha a palavra "click" — e o endpoint do Supabase é
-- literalmente /rest/v1/ml_product_clicks, então o insert nem saía do
-- navegador. Confirmado nos Logs do Supabase: /rest/v1/tab_visits
-- (outro evento de analytics) aparece aos montes com 201; já
-- /rest/v1/ml_product_clicks tem ZERO requisições registradas, mesmo
-- com cliques reais logado.
--
-- Fix: renomear tabela/policies/função pra tirar "click" da URL.
-- Nenhum dado real é perdido (a tabela nunca recebeu uma linha sequer,
-- exatamente por causa do bloqueio).
--
-- Rode isso inteiro no SQL Editor do Supabase.
-- ================================================================

-- 1) Renomeia a tabela (preserva estrutura, RLS ligado e qualquer
-- linha que por acaso já exista).
alter table if exists ml_product_clicks rename to ml_product_redirects;

-- 2) Recria as policies com nome novo (funcionalmente já continuavam
-- valendo após o rename da tabela — isso é só pra não ficar com nome
-- de policy desatualizado).
drop policy if exists "own_product_click_insert" on ml_product_redirects;
drop policy if exists "own_product_redirect_insert" on ml_product_redirects;
create policy "own_product_redirect_insert" on ml_product_redirects
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_product_click_select" on ml_product_redirects;
drop policy if exists "own_product_redirect_select" on ml_product_redirects;
create policy "own_product_redirect_select" on ml_product_redirects
  for select using (auth.uid() = user_id);

-- 3) Nova função de agregação (RPC também tem "click" na URL —
-- /rest/v1/rpc/admin_product_click_stats — então também trocamos o
-- nome por segurança, mesmo sendo usada só pelo admin).
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

-- 4) Remove a função antiga (não é mais chamada por ninguém depois
-- que analytics.js for atualizado).
drop function if exists admin_product_click_stats(int);
