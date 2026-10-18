-- ════════════════════════════════════════════════════════════════════════════════
-- Alertas de preço PESSOAIS na aba de busca do Mercado Livre (18/10/2026)
-- Cada usuário logado escolhe um produto acompanhado, define o valor-alvo e recebe aviso (sino + push no celular) quando
-- o preço do Mercado Livre chegar nesse valor. Reaproveita a busca de preços de sempre (ml_price_history) e o envio de
-- notificações (tabela notifications → trg_notify_dispatch → push). Complementa o aviso GLOBAL de promoção (ml_check_deals,
-- que só vai para o Eduardo).
--   • Só dá pra criar/alterar/apagar pelas RPCs (nada de escrita direta); cada pessoa só enxerga os próprios alertas.
--   • Máx. 30 alertas por pessoa. Um alerta por produto (criar de novo só muda o valor e rearma).
--   • "Armado": avisa uma vez quando o preço cai até o alvo; só avisa de novo depois que o preço subir acima do alvo e
--     voltar a cair (ou cair ≥5% abaixo do último preço avisado), com intervalo mínimo de 6 h.
-- ════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ml_price_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  term_id bigint not null references public.ml_search_terms(id) on delete cascade,
  target_price numeric(10,2) not null check (target_price > 0 and target_price <= 100000),
  armed boolean not null default true,
  last_notified_at timestamptz,
  last_notified_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, term_id)
);
create index if not exists ml_price_alerts_term_idx on public.ml_price_alerts (term_id);

alter table public.ml_price_alerts enable row level security;
drop policy if exists ml_price_alerts_select on public.ml_price_alerts;
create policy ml_price_alerts_select on public.ml_price_alerts for select to authenticated using (user_id = auth.uid());
revoke all on public.ml_price_alerts from anon, authenticated;
grant select on public.ml_price_alerts to authenticated;

-- criar/alterar o alerta do usuário para um produto
create or replace function public.ml_set_price_alert(p_term bigint, p_target numeric)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then raise exception 'Faça login.'; end if;
  if p_target is null or p_target <= 0 or p_target > 100000 then raise exception 'Informe um valor entre R$ 0,01 e R$ 100.000.'; end if;
  if not exists (select 1 from public.ml_search_terms t where t.id = p_term and t.active) then raise exception 'Produto não encontrado.'; end if;
  if not exists (select 1 from public.ml_price_alerts where user_id = v_uid and term_id = p_term)
     and (select count(*) from public.ml_price_alerts where user_id = v_uid) >= 30 then
    raise exception 'Limite de 30 alertas. Apague algum para criar outro.';
  end if;
  insert into public.ml_price_alerts (user_id, term_id, target_price)
  values (v_uid, p_term, round(p_target, 2))
  on conflict (user_id, term_id) do update
    set target_price = excluded.target_price, armed = true, last_notified_at = null, last_notified_price = null, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ml_remove_price_alert(p_term bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  delete from public.ml_price_alerts where user_id = auth.uid() and term_id = p_term;
  return found;
end $$;

-- varredura (cron a cada 5 min): compara o preço MAIS RECENTE (últimos 40 min) com o alvo de cada alerta
create or replace function public.ml_check_price_alerts(p_dry_run boolean default false)
returns table(alert_id bigint, user_id uuid, term_id bigint, price numeric, target numeric, notified boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  r record;
  v_fire boolean;
  v_link text;
  v_body text;
begin
  for r in
    select a.id, a.user_id, a.term_id, a.target_price, a.armed, a.last_notified_at, a.last_notified_price,
           coalesce(t.label, t.term) lbl, t.affiliate_url, t.catalog_product_id, l.price p1, l.url purl
    from public.ml_price_alerts a
    join public.ml_search_terms t on t.id = a.term_id and t.active
    join lateral (select h.price, h.url from public.ml_price_history h
                   where h.term_id = a.term_id and h.found_at > now() - interval '40 minutes'
                   order by h.found_at desc limit 1) l on true
  loop
    if r.p1 > r.target_price then
      -- subiu acima do alvo: rearma pro próximo aviso
      if not r.armed and not p_dry_run then update public.ml_price_alerts set armed = true, updated_at = now() where id = r.id; end if;
      continue;
    end if;

    v_fire := (r.armed or (r.last_notified_price is not null and r.p1 <= r.last_notified_price * 0.95))
              and (r.last_notified_at is null or r.last_notified_at < now() - interval '6 hours');
    alert_id := r.id; user_id := r.user_id; term_id := r.term_id; price := r.p1; target := r.target_price;
    notified := v_fire and not p_dry_run;

    if notified then
      v_link := coalesce(nullif(r.affiliate_url, ''), nullif(r.purl, ''), 'https://www.mercadolivre.com.br/p/' || r.catalog_product_id);
      v_body := 'R$ ' || to_char(r.p1, 'FM999G990D00') || ' (seu alvo: R$ ' || to_char(r.target_price, 'FM999G990D00') || ')';
      v_body := replace(replace(replace(v_body, '.', '#'), ',', '.'), '#', ',');
      insert into public.notifications (user_id, type, title, body, data)
      values (r.user_id, 'price_alert', '🔔 Chegou no seu preço: ' || left(r.lbl, 80), v_body,
              jsonb_build_object('url', v_link, 'term_id', r.term_id, 'price', r.p1, 'target', r.target_price));
      update public.ml_price_alerts set armed = false, last_notified_at = now(), last_notified_price = r.p1, updated_at = now() where id = r.id;
    end if;
    if v_fire or p_dry_run then return next; end if;
  end loop;
end $$;

revoke all on function public.ml_set_price_alert(bigint, numeric) from public, anon;
revoke all on function public.ml_remove_price_alert(bigint) from public, anon;
revoke all on function public.ml_check_price_alerts(boolean) from public, anon, authenticated;
grant execute on function public.ml_set_price_alert(bigint, numeric) to authenticated;
grant execute on function public.ml_remove_price_alert(bigint) to authenticated;

-- cron: a cada 5 min (logo depois da busca de preços, que roda de 15 em 15 min)
select cron.schedule('ml-price-alerts', '3-59/5 * * * *', 'select public.ml_check_price_alerts();')
 where not exists (select 1 from cron.job where jobname = 'ml-price-alerts');
