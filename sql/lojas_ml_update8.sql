-- ================================================================
-- MyDeck — LOJAS & MERCADO LIVRE TRACKER · Update 8
-- Cupons por REGRA GERAL, em vez de vincular produto por produto.
--
-- Contexto: cadastrar um cupom testado em cada produto individualmente
-- (feito no update5/6) dá muito trabalho quando o cupom é geral do ML
-- (ex: "20% OFF acima de R$79, até R$50 de desconto" — vale pra
-- qualquer produto que bata essas condições). Agora o admin cadastra
-- a REGRA uma vez, e o site calcula sozinho, em cada produto
-- rastreado, se ela se aplica e qual seria o preço com desconto.
-- ================================================================

create table if not exists ml_coupon_rules (
  id bigint generated always as identity primary key,
  code text not null,
  description text,
  discount_type text not null,        -- 'percent' | 'fixed'
  discount_value numeric not null,    -- ex: 20 (=20%) ou 50 (=R$50)
  min_purchase numeric,               -- compra mínima pra regra valer (null = sem mínimo)
  max_discount numeric,               -- teto do desconto em R$ (null = sem teto, só relevante pra 'percent')
  active boolean not null default true,
  valid_until date,                   -- opcional: data de validade do cupom
  created_at timestamptz not null default now()
);

alter table ml_coupon_rules enable row level security;

-- Leitura pública (todo mundo vê as ofertas com desconto aplicado)
drop policy if exists "ml_coupon_rules_select_all" on ml_coupon_rules;
create policy "ml_coupon_rules_select_all" on ml_coupon_rules
  for select using (true);

-- Escrita: só a conta principal do Eduardo (mesmo padrão de ml_coupons)
drop policy if exists "ml_coupon_rules_write_admin" on ml_coupon_rules;
create policy "ml_coupon_rules_write_admin" on ml_coupon_rules
  for all
  using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b')
  with check (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');
