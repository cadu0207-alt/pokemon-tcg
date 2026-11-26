-- 26/11/2026 — link compartilhado de Pokédex.
-- Desde 24/11 a Pokédex do fichário novo conta só as marcações feitas dentro dela (chaves "dex-<id>:set:numero:versao",
-- decisão da Alice e do Eduardo). A função do link enviava apenas as chaves da coleção principal, e a Pokédex
-- compartilhada aparecia zerada. Agora, quando o link é de Pokédex, ela envia as marcações daquela Pokédex.
-- Os outros dois casos (coleção e fichário personalizado) continuam iguais. Mesma assinatura: as permissões se mantêm.
-- Limite: a Pokédex é identificada pelo nome salvo no link; se for renomeada depois, o link antigo aparece zerado.
-- Precisa também do front que chama a função com p_token (fichario-novo.js).

create or replace function public.get_share_collection(p_token text)
 returns table(set_key text, view_mode text, layout integer, slot_keys text[], card_ids jsonb, binder_name text)
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
    return query
    select v_set_key, v_view_mode, v_layout,
           coalesce(array_agg(distinct c.slot_key), array[]::text[]),
           v_card_ids, v_binder_name
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
    return query
    select v_set_key, v_view_mode, v_layout,
           coalesce(array_agg(c.slot_key), array[]::text[]),
           null::jsonb, null::text
    from collection c
    where c.user_id = v_user_id
      and c.slot_key like v_set_key || ':%';
  end if;
end;
$function$;
