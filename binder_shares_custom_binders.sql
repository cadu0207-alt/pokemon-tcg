-- ============================================================
-- MyDeck — Compartilhar FICHÁRIOS PERSONALIZADOS (__custom__)
-- Rodar DEPOIS de binder_shares_setup.sql, no Supabase SQL Editor
-- (app.supabase.com → SQL Editor → colar → Run)
-- ============================================================

-- set_key passa a ser opcional: um share ou tem set_key (fichário normal
-- de um set) OU tem card_ids (fichário personalizado, snapshot resolvido
-- no momento em que o Eduardo clicou em compartilhar)
alter table public.binder_shares
  alter column set_key drop not null,
  add column if not exists card_ids jsonb,
  add column if not exists binder_name text;

-- Precisa recriar a função porque o tipo de retorno mudou
-- (CREATE OR REPLACE não permite trocar o shape de retorno)
drop function if exists public.get_share_collection(text);

create or replace function public.get_share_collection(p_token text)
returns table(set_key text, view_mode text, layout int, slot_keys text[], card_ids jsonb, binder_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_set_key     text;
  v_view_mode   text;
  v_layout      int;
  v_card_ids    jsonb;
  v_binder_name text;
begin
  select b.user_id, b.set_key, b.view_mode, b.layout, b.card_ids, b.binder_name
    into v_user_id, v_set_key, v_view_mode, v_layout, v_card_ids, v_binder_name
  from binder_shares b
  where b.token = p_token
  limit 1;

  if v_user_id is null then
    return; -- token inválido: devolve zero linhas
  end if;

  if v_card_ids is not null then
    -- Fichário personalizado: só devolve slot_keys das cartas que fazem
    -- parte do snapshot (card_ids), não a coleção inteira do usuário.
    return query
    select v_set_key, v_view_mode, v_layout,
           coalesce(array_agg(distinct c.slot_key), array[]::text[]),
           v_card_ids, v_binder_name
    from collection c
    where c.user_id = v_user_id
      and exists (
        select 1 from jsonb_array_elements(v_card_ids) e
        where c.slot_key like (e->>'set') || ':' || (e->>'n') || ':%'
      );
  else
    -- Fichário normal de um set completo
    return query
    select v_set_key, v_view_mode, v_layout,
           coalesce(array_agg(c.slot_key), array[]::text[]),
           null::jsonb, null::text
    from collection c
    where c.user_id = v_user_id
      and c.slot_key like v_set_key || ':%';
  end if;
end;
$$;

grant execute on function public.get_share_collection(text) to anon, authenticated;
