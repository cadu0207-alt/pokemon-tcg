-- ================================================================
-- MyDeck — LOJAS: atualização de 5 em 5 min da Celebração 30 Anos +
-- AVISO DE PROMOÇÃO NO CELULAR (15/10/2026) · Update 15
--
-- JÁ APLICADO no Supabase (migration lojas_deal_alerts) — arquivo só
-- pra registro.
--
-- 1) Cron extra 'ml-refresh-cel30-5min' chama ml-refresh-all com
--    ?collection=Celebração 30 Anos nos minutos 5,10,20,25,35,40,50,55.
--    Junto com o cron geral (*/15) dá exatamente 5 em 5 min pra essa
--    coleção, sem chamada duplicada. Os outros produtos seguem 15 min.
--
-- 2) ml_check_deals() roda a cada 5 min (minuto 2, 7, 12…, logo depois
--    das raspagens) e manda push pro celular do Eduardo quando acha uma
--    promoção REALMENTE boa:
--      a) produto com preço sugerido (msrp): preço <= msrp + 10%
--      b) qualquer produto: preço >= 15% abaixo da MEDIANA dos últimos
--         30 dias (precisa de pelo menos 3 dias e 10 leituras de histórico)
--    Proteções:
--      • as DUAS últimas leituras precisam bater a regra (leitura isolada
--        com erro não dispara aviso — mesmo problema do update 14)
--      • leituras com mais de 40 min não contam (cron parado ≠ promoção)
--      • o mesmo produto só avisa de novo depois de 24 h, OU antes disso
--        se o preço cair mais 5% em relação ao último aviso
--    O aviso entra na tabela notifications (sino do site) com type
--    'deal_alert' → o gatilho trg_notify_dispatch já existente manda o
--    push. Não gera e-mail (EMAIL_TYPES do notify-dispatch não inclui).
--
-- Ajustável sem publicar nada (app_private_config):
--   deal_msrp_tolerance (0.10) · deal_median_drop (0.15)
--   deal_cooldown_hours (24) · deal_recipients (uuid,uuid…)
-- Teste sem enviar nada:  select * from ml_check_deals(true);
-- ================================================================

insert into app_private_config (key, value) values
  ('deal_msrp_tolerance', '0.10'),
  ('deal_median_drop',    '0.15'),
  ('deal_cooldown_hours', '24'),
  ('deal_recipients',     'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b')
on conflict (key) do nothing;

create table if not exists ml_deal_alerts (
  id       bigint generated always as identity primary key,
  term_id  bigint not null references ml_search_terms(id) on delete cascade,
  price    numeric not null,
  rule     text not null,          -- 'msrp' | 'median'
  basis    numeric not null,       -- msrp ou mediana usada na comparação
  sent_at  timestamptz not null default now()
);
create index if not exists ml_deal_alerts_term_idx on ml_deal_alerts (term_id, sent_at desc);
alter table ml_deal_alerts enable row level security;
revoke all on ml_deal_alerts from anon, authenticated;

create or replace function ml_check_deals(p_dry_run boolean default false)
returns table (term_id bigint, label text, price numeric, rule text, basis numeric, pct numeric, sent boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tol      numeric := coalesce((select value::numeric from app_private_config where key = 'deal_msrp_tolerance'), 0.10);
  v_drop     numeric := coalesce((select value::numeric from app_private_config where key = 'deal_median_drop'), 0.15);
  v_cooldown int     := coalesce((select value::int     from app_private_config where key = 'deal_cooldown_hours'), 24);
  v_users    uuid[]  := coalesce((select string_to_array(value, ',')::uuid[] from app_private_config where key = 'deal_recipients'),
                                 array['eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid]);
  r record;
  v_last record;
  v_send boolean;
  v_title text;
  v_body text;
begin
  for r in
    with last2 as (
      select h.term_id, h.price, h.url, h.found_at,
             row_number() over (partition by h.term_id order by h.found_at desc) rn
      from ml_price_history h
      join ml_search_terms t on t.id = h.term_id and t.active
      where h.found_at > now() - interval '2 hours'
    ),
    cur as (
      select a.term_id, a.price p1, b.price p0, a.url, a.found_at
      from last2 a join last2 b on b.term_id = a.term_id and b.rn = 2
      where a.rn = 1 and a.found_at > now() - interval '40 minutes'
    ),
    hist as (
      select h.term_id,
             percentile_cont(0.5) within group (order by h.price) med,
             count(*) n,
             count(distinct (h.found_at at time zone 'America/Sao_Paulo')::date) days
      from ml_price_history h
      where h.found_at > now() - interval '30 days'
      group by h.term_id
    )
    select t.id, coalesce(t.label, t.term) lbl, t.msrp, t.collection,
           coalesce(t.affiliate_url, c.url, 'https://www.mercadolivre.com.br/p/' || t.catalog_product_id) link,
           c.p1, c.p0, hs.med, hs.n, hs.days
    from cur c
    join ml_search_terms t on t.id = c.term_id
    left join hist hs on hs.term_id = c.term_id
  loop
    -- regra a) preço sugerido
    if r.msrp is not null
       and r.p1 <= round(r.msrp * (1 + v_tol), 2)
       and r.p0 <= round(r.msrp * (1 + v_tol), 2) then
      term_id := r.id; label := r.lbl; price := r.p1; rule := 'msrp'; basis := r.msrp;
    -- regra b) bem abaixo do normal do próprio produto
    elsif r.med is not null and r.days >= 3 and r.n >= 10
       and r.p1 <= r.med * (1 - v_drop)
       and r.p0 <= r.med * (1 - v_drop) then
      term_id := r.id; label := r.lbl; price := r.p1; rule := 'median'; basis := round(r.med::numeric, 2);
    else
      continue;
    end if;

    pct := round((price - basis) / basis * 100, 1);

    select a.price, a.sent_at into v_last
    from ml_deal_alerts a where a.term_id = r.id order by a.sent_at desc limit 1;

    v_send := v_last is null
           or v_last.sent_at < now() - make_interval(hours => v_cooldown)
           or price <= v_last.price * 0.95;
    sent := v_send and not p_dry_run;

    if sent then
      insert into ml_deal_alerts (term_id, price, rule, basis) values (r.id, price, rule, basis);

      v_title := '💰 Promoção: ' || r.lbl;
      -- to_char sai no formato 1,234.56; a troca no fim vira 1.234,56
      v_body  := 'R$ ' || to_char(price, 'FM999G990D00') ||
                 case when rule = 'msrp'
                   then case when pct <= 0 then ' — ' || abs(pct)::text || '% abaixo do sugerido'
                             else ' — só +' || pct::text || '% do sugerido' end
                        || ' (R$ ' || to_char(basis, 'FM999G990D00') || ')'
                   else ' — ' || abs(pct)::text || '% abaixo do normal dos últimos 30 dias (R$ '
                        || to_char(basis, 'FM999G990D00') || ')'
                 end;
      v_body := replace(replace(replace(v_body, '.', '#'), ',', '.'), '#', ',');

      insert into notifications (user_id, type, title, body, data)
      select u, 'deal_alert', v_title, v_body,
             jsonb_build_object('url', r.link, 'term_id', r.id, 'price', price, 'rule', rule)
      from unnest(v_users) u;
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function ml_check_deals(boolean) from public, anon, authenticated;

select cron.schedule('ml-deal-alerts', '2-59/5 * * * *', $$ select ml_check_deals(); $$);
