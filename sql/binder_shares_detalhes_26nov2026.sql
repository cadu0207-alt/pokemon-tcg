-- 26/11/2026 — link compartilhado com qualidade e quantidade.
-- O fichário novo já lê a coluna "slots" (slot_key, quantity, origins); faltava a função enviá-la.
-- Substitui binder_shares_pokedex_26nov2026.sql: o ajuste da Pokédex está incluído aqui.
--
-- Privacidade: "slots" traz só as mesmas cartas de "slot_keys", e de "origins" saem apenas a qualidade (cond:X)
-- e os lotes com quantidade e qualidade. Nomes de compras e qualquer outro texto ficam de fora.
-- Limite: a Pokédex é identificada pelo nome salvo no link; se for renomeada depois, o link antigo aparece zerado.
--
-- Pode rodar inteiro no SQL Editor. Se qualquer link existente der erro com a função nova, nada é alterado.

begin;

-- o formato do retorno muda, por isso é preciso apagar e criar de novo (dentro da mesma transação)
drop function if exists public.get_share_collection(text);

create function public.get_share_collection(p_token text)
 returns table(set_key text, view_mode text, layout integer, slot_keys text[], card_ids jsonb, binder_name text, slots jsonb)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_set_key     text;
  v_view_mode   text;
  v_layout      int;
  v_card_ids    jsonb;
  v_binder_name text;
  v_keys        text[];
begin
  select b.user_id, b.set_key, b.view_mode, b.layout, b.card_ids, b.binder_name
    into v_user_id, v_set_key, v_view_mode, v_layout, v_card_ids, v_binder_name
    from binder_shares b
    where b.token = p_token
    limit 1;

  if v_user_id is null then
    return;
  end if;

  if v_card_ids is not null
     and exists (select 1 from jsonb_array_elements(v_card_ids) e where e ? 'dex' or e ? 'empty') then
    -- Pokédex: só as marcações da própria Pokédex
    select coalesce(array_agg(distinct c.slot_key), array[]::text[]) into v_keys
    from collection c
    where c.user_id = v_user_id
      and c.slot_key like 'dex-%'
      and (
        c.slot_key like 'dex-shared:%'
        or exists (
          select 1 from custom_binders cb
          where cb.user_id = v_user_id
            and cb.name = v_binder_name
            and c.slot_key like 'dex-' || cb.id::text || ':%'
        )
      )
      and exists (
        select 1 from jsonb_array_elements(v_card_ids) e
        where substr(c.slot_key, strpos(c.slot_key, ':') + 1) like (e->>'set') || ':' || (e->>'n') || ':%'
      );
  elsif v_card_ids is not null then
    -- fichário personalizado
    select coalesce(array_agg(distinct c.slot_key), array[]::text[]) into v_keys
    from collection c
    where c.user_id = v_user_id
      and exists (
        select 1 from jsonb_array_elements(v_card_ids) e
        where c.slot_key like (e->>'set') || ':' || (e->>'n') || ':%'
      );
  else
    -- coleção
    v_binder_name := null;
    select coalesce(array_agg(c.slot_key), array[]::text[]) into v_keys
    from collection c
    where c.user_id = v_user_id
      and c.slot_key like v_set_key || ':%';
  end if;

  return query
  select v_set_key, v_view_mode, v_layout, v_keys, v_card_ids, v_binder_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot_key', c.slot_key,
        'quantity', c.quantity,
        'origins', coalesce((
          select jsonb_agg(m.item order by m.pos)
          from (
            select o.pos,
              case
                when o.val ~ '^cond:(M|NM|SP|MP|HP|D)$' then o.val
                when o.val like 'lot:%' and o.val ~ '"q":[1-9]' then
                  'lot:' || jsonb_strip_nulls(jsonb_build_object(
                    'q', substring(o.val from '"q":([0-9]{1,6})')::int,
                    'c', substring(o.val from '"c":"(M|NM|SP|MP|HP|D)"')
                  ))::text
              end as item
            from jsonb_array_elements_text(
                   case when jsonb_typeof(c.origins) = 'array' then c.origins else '[]'::jsonb end
                 ) with ordinality as o(val, pos)
          ) m
          where m.item is not null
        ), '[]'::jsonb)
      ))
      from collection c
      where c.user_id = v_user_id
        and c.slot_key = any(v_keys)
    ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_share_collection(text) from public;
grant execute on function public.get_share_collection(text) to anon, authenticated, service_role;

-- prova: roda a função em todos os links existentes; um erro aqui desfaz tudo
do $check$
begin
  perform r.slots from public.binder_shares b, lateral public.get_share_collection(b.token) r;
end
$check$;

notify pgrst, 'reload schema';

commit;

-- resultado que aparece na tela
select count(*) as links,
       count(*) filter (where cardinality(r.slot_keys) > 0) as links_com_marcacoes,
       count(*) filter (where r.slots::text like '%cond:%' or r.slots::text like '%lot:%') as links_com_qualidade_ou_lote
from public.binder_shares b, lateral public.get_share_collection(b.token) r;
