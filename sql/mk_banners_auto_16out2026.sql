-- MyDeck — Loja Toybox: automação dos banners e do aviso de novidades (16/10/2026)
--
-- Os banners do site (Início, faixa do topo, Fichário, Leilão) se montam sozinhos a partir dos produtos ATIVOS
-- e COM ESTOQUE da loja: nada de cadastrar banner à mão. Para isso a tabela de produtos ganha:
--   • published_at — carimbo do dia em que o produto foi publicado pela 1ª vez (vira "novidade" por 7 dias);
--   • featured     — o lojista marca ⭐ destaque e o produto passa na frente nos banners.
-- A loja ganha uma chamada opcional (promo_title / promo_text) que substitui o texto padrão do banner do Início.
--
-- Aviso automático de novidades (sino + push, pelo mesmo caminho das notícias, então respeita os limites de push):
-- mk_notify_new_arrivals() roda todo dia às 12h (Brasília) e, SE estiver ligada, publica uma notícia
-- "Chegaram N produtos novos na Toybox" quando houver produtos novos publicados desde o último aviso, com no
-- mínimo mk_digest_min (padrão 3) e no máximo 1 aviso a cada 6 dias. Nasce DESLIGADA:
--   ligar:     update app_private_config set value = '1' where key = 'mk_digest_enabled';
--   desligar:  update app_private_config set value = '0' where key = 'mk_digest_enabled';

alter table public.mk_products add column if not exists published_at timestamptz;
alter table public.mk_products add column if not exists featured boolean not null default false;
alter table public.mk_sellers  add column if not exists promo_title text check (promo_title is null or char_length(promo_title) <= 80);
alter table public.mk_sellers  add column if not exists promo_text  text check (promo_text  is null or char_length(promo_text)  <= 200);

update public.mk_products set published_at = coalesce(published_at, created_at) where status = 'ativo' and published_at is null;

create or replace function public.mk_products_published() returns trigger language plpgsql as $$
begin
  if new.status = 'ativo' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists mk_products_published_trg on public.mk_products;
create trigger mk_products_published_trg before insert or update of status on public.mk_products
  for each row execute function public.mk_products_published();

create index if not exists mk_products_pub_idx on public.mk_products (seller_id, published_at desc) where status = 'ativo';

-- ── aviso automático de novidades ──────────────────────────────────────────
insert into public.app_private_config (key, value) values ('mk_digest_enabled', '0'), ('mk_digest_min', '3')
on conflict (key) do nothing;

create or replace function public.mk_notify_new_arrivals()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_on text; v_min int; v_last timestamptz; v_n int; v_since timestamptz;
  v_seller public.mk_sellers; v_title text; v_body text; v_cover text;
begin
  select value into v_on from public.app_private_config where key = 'mk_digest_enabled';
  if coalesce(v_on, '0') <> '1' then return 0; end if;
  select coalesce(nullif(value, '')::int, 3) into v_min from public.app_private_config where key = 'mk_digest_min';
  select nullif(value, '')::timestamptz into v_last from public.app_private_config where key = 'mk_digest_last';
  if v_last is not null and now() - v_last < interval '6 days' then return 0; end if;
  v_since := coalesce(v_last, '2000-01-01'::timestamptz);

  select * into v_seller from public.mk_sellers where status = 'ativa' order by created_at limit 1;
  if v_seller.id is null then return 0; end if;

  select count(*) into v_n
    from public.mk_products p join public.mk_stock s on s.product_id = p.id
   where p.seller_id = v_seller.id and p.status = 'ativo' and s.qty_available > 0 and p.published_at > v_since;
  if v_n < greatest(coalesce(v_min, 3), 1) then return 0; end if;

  select string_agg(line, E'\n' order by ord) into v_body from (
    select row_number() over (order by p.featured desc, p.published_at desc) as ord,
           '• ' || p.title || ' — R$ ' || replace(to_char(p.price, 'FM999990.00'), '.', ',') as line
      from public.mk_products p join public.mk_stock s on s.product_id = p.id
     where p.seller_id = v_seller.id and p.status = 'ativo' and s.qty_available > 0 and p.published_at > v_since
     order by p.featured desc, p.published_at desc limit 5) t;

  select i.url into v_cover
    from public.mk_products p join public.mk_stock s on s.product_id = p.id
    join public.mk_product_images i on i.product_id = p.id
   where p.seller_id = v_seller.id and p.status = 'ativo' and s.qty_available > 0 and p.published_at > v_since and i.url ~ '^https://'
   order by p.featured desc, p.published_at desc, i.position limit 1;

  v_title := case when v_n = 1 then 'Chegou um produto novo na ' || v_seller.name
                  else 'Chegaram ' || v_n || ' produtos novos na ' || v_seller.name end;

  insert into public.pokemon_news (title, subtitle, body, media_type, media_url, author_uid)
  values (v_title, 'Loja parceira do MyDeck',
    'Novidades na loja ' || v_seller.name || ':' || E'\n\n' || coalesce(v_body, '') ||
    case when v_n > 5 then E'\n• …e mais ' || (v_n - 5) else '' end ||
    E'\n\nVeja tudo na aba Loja Toybox. Loja parceira do MyDeck.',
    case when v_cover is null then 'none' else 'image' end, v_cover, 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid);

  insert into public.app_private_config (key, value) values ('mk_digest_last', now()::text)
  on conflict (key) do update set value = excluded.value;
  return v_n;
end $$;

revoke all on function public.mk_notify_new_arrivals() from public, anon, authenticated;
grant execute on function public.mk_notify_new_arrivals() to service_role;

select cron.schedule('mk-new-arrivals', '0 15 * * *', $$select public.mk_notify_new_arrivals()$$);
