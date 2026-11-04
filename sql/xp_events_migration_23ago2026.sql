-- ================================================================
-- MyDeck — MIGRAÇÃO DE XP: do Fichário pras ações "de verdade"
-- xp_events_migration_23ago2026.sql
-- ================================================================
-- Pedido do Eduardo (23/08/2026): tirar o XP de marcar carta no
-- Fichário (fácil de inventar — não prova que a pessoa está usando o
-- site) e passar a creditar XP só em ações que realmente acontecem
-- no servidor e não dá pra fraudar pelo client:
--   1) Capturar Pokémon selvagem no minigame (wild_pokemon.js)
--   2) Dar lance em leilão (1x por leilão, evita "lance-ping-pong"
--      entre duas contas só pra farmar XP)
--   3) Vencer um leilão (arrematar)
--   4) Comprar uma carta ou item na Loja do Leiloeiro (conta como
--      compra só quando o pagamento é confirmado — 'pago' — não na
--      hora de reservar, que é de graça e cancelável)
--
-- IMPORTANTE — leia antes de rodar:
-- Este arquivo assume que as tabelas `user_progress`, `achievements`,
-- `user_achievements` já existem no seu Supabase (o xp_system.js já
-- lê delas hoje), mas ELAS NÃO TÊM ARQUIVO .sql NO REPO — foram
-- criadas direto no SQL Editor em algum momento e nunca versionadas
-- (ver claude/analise-sistema-xp-conquistas-23ago2026.md). Este
-- script assume o formato que o client já usa:
--   user_progress(user_id pk, total_xp int, level int)
--   achievements(code pk, title, description, icon, category, set_code, xp_bonus)
--   user_achievements(user_id, achievement_code, unlocked_at, is_pioneer)
--     com constraint única em (user_id, achievement_code)
-- Se alguma dessas suposições estiver errada, o próprio Postgres vai
-- recusar com um erro claro (não corrompe nada silenciosamente) — me
-- avise o erro exato que eu ajusto.
--
-- Depois de rodar isso, o gatilho ANTIGO que credita XP ao marcar
-- carta no Fichário continua ativo em paralelo (eu não sei o nome
-- dele — não está em nenhum arquivo do repo). Se você quer DESLIGAR
-- o XP do Fichário (não só adicionar as novas fontes), rode primeiro
-- isto pra descobrir o nome do gatilho:
--
--   select tgname, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'collection'::regclass and not tgisinternal;
--
-- ...e depois (com o nome real no lugar de <nome>):
--   alter table collection disable trigger <nome>;
-- ================================================================


-- ================================================================
-- 1. LEDGER DE EVENTOS DE XP (idempotência + auditoria)
-- ================================================================
-- Toda concessão de XP passa por aqui. unique(user_id, source, source_id)
-- garante que o MESMO evento (ex: "primeiro lance no leilão #42") nunca
-- credita XP duas vezes, mesmo se a função for chamada de novo por
-- retry de rede — sem travar eventos legítimos repetidos de OUTRO
-- source_id (ex: capturar Pokémon de novo, que usa um id novo a cada vez).
create table if not exists xp_event_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null,   -- 'wild_catch' | 'leilao_lance' | 'leilao_vitoria' | 'loja_compra' | 'achievement'
  source_id   text not null,   -- chave que identifica o evento específico (auction_id, reservation_id, uuid da captura, código da conquista)
  points      int not null,
  created_at  timestamptz not null default now(),
  unique (user_id, source, source_id)
);
alter table xp_event_log enable row level security;
drop policy if exists "xp_event_log_select_own" on xp_event_log;
create policy "xp_event_log_select_own" on xp_event_log
  for select using (user_id = auth.uid());
-- Sem policy de insert/update/delete pro client — só as funções
-- SECURITY DEFINER abaixo escrevem aqui.


-- ================================================================
-- 2. FÓRMULA DE NÍVEL (mesma do xp_system.js: xpCumulative(L)=25·L·(L+1))
-- ================================================================
create or replace function xp_level_for_total(p_total_xp bigint)
returns int
language sql immutable
as $$
  select greatest(1, floor((-1 + sqrt(1 + (4.0 * greatest(p_total_xp,0) / 25))) / 2)::int + 1);
$$;


-- ================================================================
-- 3. HELPERS INTERNOS — NÃO chamáveis direto pelo client (só de
-- dentro de outra função SECURITY DEFINER, que já valida a ação real
-- antes de chamar). Por isso o REVOKE EXECUTE FROM PUBLIC logo abaixo
-- de cada uma — sem isso, qualquer usuário logado poderia chamar
-- supabase.rpc('xp_award', {...}) direto e se dar XP à vontade.
-- ================================================================
create or replace function xp_award(p_user_id uuid, p_source text, p_source_id text, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_points is null or p_points <= 0 then return; end if;

  begin
    insert into xp_event_log (user_id, source, source_id, points)
    values (p_user_id, p_source, p_source_id, p_points);
  exception when unique_violation then
    return; -- esse evento específico já creditou XP antes — não credita de novo
  end;

  insert into user_progress (user_id, total_xp, level)
  values (p_user_id, p_points, xp_level_for_total(p_points))
  on conflict (user_id) do update
    set total_xp = user_progress.total_xp + excluded.total_xp,
        level    = xp_level_for_total(user_progress.total_xp + excluded.total_xp);
end;
$$;
revoke execute on function xp_award(uuid, text, text, int) from public;

create or replace function xp_unlock_achievement(p_user_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus      int;
  v_is_pioneer boolean;
begin
  if exists (select 1 from user_achievements where user_id = p_user_id and achievement_code = p_code) then
    return; -- já desbloqueou antes
  end if;

  select xp_bonus into v_bonus from achievements where code = p_code;
  if not found then
    raise warning 'xp_unlock_achievement: código inexistente em achievements: %', p_code;
    return;
  end if;

  v_is_pioneer := not exists (select 1 from user_achievements where achievement_code = p_code);

  insert into user_achievements (user_id, achievement_code, unlocked_at, is_pioneer)
  values (p_user_id, p_code, now(), v_is_pioneer)
  on conflict (user_id, achievement_code) do nothing;

  if v_bonus is not null and v_bonus > 0 then
    perform xp_award(p_user_id, 'achievement', p_code, v_bonus);
  end if;
end;
$$;
revoke execute on function xp_unlock_achievement(uuid, text) from public;

-- índice defensivo — garante que o ON CONFLICT acima funciona mesmo
-- que a constraint existente (se já existir) tenha outro nome
create unique index if not exists user_achievements_user_code_uidx
  on user_achievements (user_id, achievement_code);


-- ================================================================
-- 4. CATÁLOGO DE CONQUISTAS NOVAS — nomes temáticos de Pokémon
-- ================================================================
insert into achievements (code, title, description, icon, category, xp_bonus) values
  ('wild_first_catch',      'Primeiro Encontro',        'Capture seu primeiro Pokémon selvagem no site.',            '🐾', 'wild_catch', 20),
  ('wild_first_rara',       'Olho Treinado',            'Capture seu primeiro Pokémon de raridade Rara.',            '🔍', 'wild_catch', 25),
  ('wild_first_especial',   'Caçador de Elite',         'Capture seu primeiro Pokémon de raridade Especial.',        '⭐', 'wild_catch', 40),
  ('wild_first_ultra',      'Lenda à Vista',            'Capture seu primeiro Pokémon Ultra-raro.',                  '✨', 'wild_catch', 150),
  ('wild_catch_10',         'Treinador de Campo',       'Capture 10 espécies diferentes.',                           '🎒', 'wild_catch', 40),
  ('wild_catch_50',         'Observador de Rota',       'Capture 50 espécies diferentes.',                           '🧭', 'wild_catch', 120),
  ('wild_catch_150',        'Mestre de Kanto',          'Complete a Pokédex de Kanto — as 151 espécies.',            '🏅', 'wild_catch', 500),
  ('wild_all_ultra',        'Guardião das Lendas',      'Capture as 6 espécies Ultra-raras de Kanto.',               '👑', 'wild_catch', 300),
  ('wild_masterball_catch', 'Captura Perfeita',         'Capture um Pokémon usando uma Master Ball.',                '🟣', 'wild_catch', 30),
  ('leilao_first_bid',      'Primeiro Lance',           'Dê seu primeiro lance em um leilão.',                       '🔨', 'leilao', 15),
  ('leilao_first_win',      'Arremate de Estreia',      'Vença seu primeiro leilão.',                                '🏆', 'leilao', 80),
  ('leilao_win_5',          'Colecionador de Elite',    'Vença 5 leilões.',                                          '💼', 'leilao', 150),
  ('leilao_win_20',         'Barão dos Leilões',        'Vença 20 leilões.',                                         '👑', 'leilao', 500),
  ('loja_first_purchase',   'Primeira Compra',          'Complete sua primeira compra na Loja do Leiloeiro.',        '🛍️', 'loja', 30),
  ('loja_first_carta',      'Caçador de Cartas Raras',  'Compre sua primeira carta avulsa na loja.',                 '🃏', 'loja', 30),
  ('loja_first_selado',     'Abridor Oficial',          'Compre seu primeiro produto lacrado na loja.',              '📦', 'loja', 30),
  ('loja_purchase_10',      'Cliente Fiel',             'Complete 10 compras na loja.',                              '💎', 'loja', 150)
on conflict (code) do nothing;


-- ================================================================
-- 5. MINIGAME DE CAPTURA — RPC server-authoritative (substitui o
-- Math.random() do client em wild_pokemon.js). O client manda qual
-- Pokémon apareceu e qual bola foi jogada; o SERVIDOR decide se
-- capturou (não o navegador), debita a bola de forma atômica (lock de
-- linha) e credita XP só em captura bem-sucedida de verdade.
-- ================================================================
create or replace function wp_catch_rate(p_tier text, p_rarity text)
returns numeric
language sql immutable
as $$
  -- espelha WP_CATCH_RATES em wild_pokemon.js — se mudar lá, mudar aqui também
  select case p_tier
    when 'pokeball'   then case p_rarity when 'comum' then .90 when 'rara' then .35 when 'especial' then .10 when 'ultra_rara' then .02 else 0 end
    when 'greatball'  then case p_rarity when 'comum' then .97 when 'rara' then .70 when 'especial' then .35 when 'ultra_rara' then .10 else 0 end
    when 'ultraball'  then case p_rarity when 'comum' then .99 when 'rara' then .90 when 'especial' then .65 when 'ultra_rara' then .30 else 0 end
    when 'masterball' then 1
    else 0
  end;
$$;

create or replace function wp_xp_for_rarity(p_rarity text)
returns int
language sql immutable
as $$
  select case p_rarity when 'comum' then 8 when 'rara' then 20 when 'especial' then 45 when 'ultra_rara' then 120 else 0 end;
$$;

create or replace function catch_wild_pokemon(p_pokemon_slug text, p_dex smallint, p_rarity text, p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balls          wild_balls%rowtype;
  v_chance         numeric;
  v_success        boolean;
  v_rec            wild_catches%rowtype;
  v_prog           user_progress%rowtype;
  v_distinct_count int;
  v_ultra_count    int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  if p_tier not in ('pokeball','greatball','ultraball','masterball') then raise exception 'Bola inválida.'; end if;
  if p_rarity not in ('comum','rara','especial','ultra_rara') then raise exception 'Raridade inválida.'; end if;

  select * into v_balls from wild_balls where user_id = auth.uid() for update;
  if not found then raise exception 'Você ainda não tem pokébolas.'; end if;

  if (p_tier='pokeball'   and v_balls.pokeball   < 1)
  or (p_tier='greatball'  and v_balls.greatball  < 1)
  or (p_tier='ultraball'  and v_balls.ultraball  < 1)
  or (p_tier='masterball' and v_balls.masterball < 1) then
    raise exception 'Você não tem mais dessa pokébola.';
  end if;

  update wild_balls set
    pokeball   = pokeball   - case when p_tier='pokeball'   then 1 else 0 end,
    greatball  = greatball  - case when p_tier='greatball'  then 1 else 0 end,
    ultraball  = ultraball  - case when p_tier='ultraball'  then 1 else 0 end,
    masterball = masterball - case when p_tier='masterball' then 1 else 0 end,
    updated_at = now()
  where user_id = auth.uid()
  returning * into v_balls;

  v_chance  := wp_catch_rate(p_tier, p_rarity);
  v_success := random() < v_chance;

  if v_success then
    insert into wild_catches (user_id, pokemon_slug, dex, rarity, count, first_caught_at, last_caught_at)
    values (auth.uid(), p_pokemon_slug, p_dex, p_rarity, 1, now(), now())
    on conflict (user_id, pokemon_slug) do update
      set count = wild_catches.count + 1, last_caught_at = now()
    returning * into v_rec;

    perform xp_award(auth.uid(), 'wild_catch', gen_random_uuid()::text, wp_xp_for_rarity(p_rarity));

    if p_tier = 'masterball' then
      perform xp_unlock_achievement(auth.uid(), 'wild_masterball_catch');
    end if;

    select count(*) into v_distinct_count from wild_catches where user_id = auth.uid();
    if v_distinct_count = 1   then perform xp_unlock_achievement(auth.uid(), 'wild_first_catch'); end if;
    if v_distinct_count = 10  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_10');   end if;
    if v_distinct_count = 50  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_50');   end if;
    if v_distinct_count = 151 then perform xp_unlock_achievement(auth.uid(), 'wild_catch_150');  end if;

    if p_rarity = 'rara' and not exists (
      select 1 from wild_catches where user_id=auth.uid() and rarity='rara' and pokemon_slug<>p_pokemon_slug
    ) then
      perform xp_unlock_achievement(auth.uid(), 'wild_first_rara');
    elsif p_rarity = 'especial' and not exists (
      select 1 from wild_catches where user_id=auth.uid() and rarity='especial' and pokemon_slug<>p_pokemon_slug
    ) then
      perform xp_unlock_achievement(auth.uid(), 'wild_first_especial');
    elsif p_rarity = 'ultra_rara' then
      if not exists (
        select 1 from wild_catches where user_id=auth.uid() and rarity='ultra_rara' and pokemon_slug<>p_pokemon_slug
      ) then
        perform xp_unlock_achievement(auth.uid(), 'wild_first_ultra');
      end if;
      select count(*) into v_ultra_count from wild_catches where user_id=auth.uid() and rarity='ultra_rara';
      if v_ultra_count = 6 then perform xp_unlock_achievement(auth.uid(), 'wild_all_ultra'); end if;
    end if;
  end if;

  select * into v_prog from user_progress where user_id = auth.uid();

  return jsonb_build_object(
    'success',  v_success,
    'balls',    jsonb_build_object('pokeball', v_balls.pokeball, 'greatball', v_balls.greatball, 'ultraball', v_balls.ultraball, 'masterball', v_balls.masterball),
    'count',    v_rec.count,
    'total_xp', coalesce(v_prog.total_xp, 0),
    'level',    coalesce(v_prog.level, 1)
  );
end;
$$;
grant execute on function catch_wild_pokemon(text, smallint, text, text) to authenticated;


-- ================================================================
-- 6. LEILÃO — estender place_bid() (lance) e close_round() (vitória)
-- Cópia integral das funções originais de leilao_setup.sql, só com os
-- blocos "NOVO — XP" acrescentados. Se você já alterou essas funções
-- depois de 23/08/2026, NÃO rode este bloco sem comparar — ele
-- substitui a função inteira (create or replace).
-- ================================================================
create or replace function place_bid(p_auction_id bigint, p_amount numeric)
returns auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction    auctions%rowtype;
  v_min_next   numeric;
  v_now        timestamptz := now();
  v_blocked    boolean;
  v_prior_bids int;              -- NOVO — XP: quantos lances esse usuário já deu ANTES deste, em qualquer leilão
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado para dar lance.';
  end if;

  select blocked into v_blocked from auction_bidder_flags where user_id = auth.uid();
  if v_blocked then
    raise exception 'Você está temporariamente bloqueado de dar lances por pagamento pendente de uma rodada anterior. Fale com o leiloeiro pra liberar.';
  end if;

  if not exists(select 1 from auction_rules_acceptance where user_id = auth.uid() and rules_version = 'v1') then
    raise exception 'Você precisa aceitar as regras do leilão antes de dar o primeiro lance.';
  end if;

  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Leilão não encontrado.';
  end if;

  if v_auction.status <> 'ativo' or v_now < v_auction.start_at or v_now > v_auction.end_at then
    raise exception 'Este leilão não está aceitando lances no momento.';
  end if;

  if v_auction.created_by = auth.uid() then
    raise exception 'O leiloeiro não pode dar lance no próprio leilão.';
  end if;

  if v_auction.current_bidder = auth.uid() then
    raise exception 'Você já é o maior lance deste leilão — aguarde outro participante cobrir.';
  end if;

  if v_auction.current_bid is null then
    v_min_next := v_auction.starting_price;
  else
    v_min_next := v_auction.current_bid + auction_min_increment(v_auction.current_bid);
  end if;

  if p_amount < v_min_next then
    raise exception 'Lance mínimo atual é R$ %', to_char(v_min_next, 'FM999999990.00');
  end if;

  select count(*) into v_prior_bids from auction_bids where bidder_id = auth.uid(); -- NOVO — XP

  insert into auction_bids (auction_id, bidder_id, amount) values (p_auction_id, auth.uid(), p_amount);

  update auctions set
    current_bid    = p_amount,
    current_bidder = auth.uid(),
    bid_count      = bid_count + 1,
    end_at = case
      when v_auction.anti_snipe_minutes > 0
       and v_auction.end_at - v_now < (v_auction.anti_snipe_minutes || ' minutes')::interval
      then v_now + (v_auction.anti_snipe_minutes || ' minutes')::interval
      else v_auction.end_at
    end,
    updated_at = v_now
  where id = p_auction_id
  returning * into v_auction;

  -- NOVO — XP: 8 XP por leilão em que você dá o PRIMEIRO lance (não
  -- credita de novo se for coberto e der lance de novo no mesmo leilão
  -- — o source_id é o próprio auction_id, ver xp_event_log). Isso
  -- também evita "ping-pong" de duas contas se cobrindo só pra farmar.
  perform xp_award(auth.uid(), 'leilao_lance', p_auction_id::text, 8);
  if v_prior_bids = 0 then
    perform xp_unlock_achievement(auth.uid(), 'leilao_first_bid');
  end if;

  return v_auction;
end;
$$;

grant execute on function place_bid(bigint, numeric) to authenticated;

create or replace function close_round(p_round_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_auction    record;
  v_has_winner boolean;
  v_addr       jsonb;
  v_email      text;
  v_order_id   bigint;
  v_round      auction_rounds%rowtype;
  v_still_open boolean;
  v_win_count  int;              -- NOVO — XP
begin
  select * into v_round from auction_rounds where id = p_round_id for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;

  for r_auction in
    select * from auctions
    where round_id = p_round_id and status = 'ativo' and now() > end_at
    for update
  loop
    v_has_winner := r_auction.current_bidder is not null
      and (r_auction.reserve_price is null or r_auction.current_bid >= r_auction.reserve_price);

    if v_has_winner then
      update auctions set
        status = 'encerrado', winner_id = r_auction.current_bidder, winning_bid = r_auction.current_bid,
        updated_at = now()
      where id = r_auction.id;

      -- NOVO — XP: 70 XP por leilão vencido + conquistas de marco.
      -- Todos os counts abaixo já enxergam esse leilão (acabou de
      -- virar 'encerrado' na linha acima, na mesma transação).
      perform xp_award(r_auction.current_bidder, 'leilao_vitoria', r_auction.id::text, 70);
      select count(*) into v_win_count from auctions where winner_id = r_auction.current_bidder;
      if v_win_count = 1  then perform xp_unlock_achievement(r_auction.current_bidder, 'leilao_first_win'); end if;
      if v_win_count = 5  then perform xp_unlock_achievement(r_auction.current_bidder, 'leilao_win_5');    end if;
      if v_win_count = 20 then perform xp_unlock_achievement(r_auction.current_bidder, 'leilao_win_20');   end if;

      select to_jsonb(a) into v_addr from user_addresses a where a.user_id = r_auction.current_bidder;
      select email into v_email from auth.users where id = r_auction.current_bidder;

      insert into auction_orders (round_id, buyer_id, amount, payment_due_at, buyer_email, shipping_snapshot)
      values (p_round_id, r_auction.current_bidder, r_auction.current_bid, v_round.payment_due_at, v_email, v_addr)
      on conflict (round_id, buyer_id) do update set
        amount = auction_orders.amount + excluded.amount,
        updated_at = now()
      returning id into v_order_id;

      insert into auction_order_items (order_id, auction_id, amount)
      values (v_order_id, r_auction.id, r_auction.current_bid)
      on conflict (auction_id) do nothing;
    else
      update auctions set status = 'encerrado', updated_at = now() where id = r_auction.id;
    end if;
  end loop;

  select exists(select 1 from auctions where round_id = p_round_id and status = 'ativo') into v_still_open;
  if not v_still_open and v_round.status <> 'encerrado' then
    update auction_rounds set status = 'encerrado', updated_at = now() where id = p_round_id;
  end if;
end;
$$;

grant execute on function close_round(bigint) to authenticated;


-- ================================================================
-- 7. LOJA DO LEILOEIRO — estender store_reservation_after_update()
-- XP só quando o pagamento é CONFIRMADO ('pago'), nunca na reserva
-- (reserva é grátis e cancelável a qualquer momento).
-- ================================================================
create or replace function store_reservation_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind       text;   -- NOVO — XP
  v_paid_count int;    -- NOVO — XP
begin
  if new.status = old.status then return new; end if;

  if new.status = 'pago' and old.status = 'reservado' then
    update store_items set
      qty_reserved = greatest(qty_reserved - new.qty, 0),
      qty_sold = qty_sold + new.qty,
      updated_at = now()
    where id = new.item_id;

    -- NOVO — XP: 25 XP por compra confirmada + conquistas de marco,
    -- diferenciando carta avulsa (kind='carta') de produto lacrado (kind='selado').
    select kind into v_kind from store_items where id = new.item_id;
    perform xp_award(new.buyer_id, 'loja_compra', new.id::text, 25);

    select count(*) into v_paid_count from store_reservations where buyer_id = new.buyer_id and status = 'pago';
    if v_paid_count = 1  then perform xp_unlock_achievement(new.buyer_id, 'loja_first_purchase'); end if;
    if v_paid_count = 10 then perform xp_unlock_achievement(new.buyer_id, 'loja_purchase_10');    end if;

    if v_kind = 'carta' and not exists (
      select 1 from store_reservations sr join store_items si on si.id = sr.item_id
      where sr.buyer_id = new.buyer_id and sr.status = 'pago' and si.kind = 'carta' and sr.id <> new.id
    ) then
      perform xp_unlock_achievement(new.buyer_id, 'loja_first_carta');
    elsif v_kind = 'selado' and not exists (
      select 1 from store_reservations sr join store_items si on si.id = sr.item_id
      where sr.buyer_id = new.buyer_id and sr.status = 'pago' and si.kind = 'selado' and sr.id <> new.id
    ) then
      perform xp_unlock_achievement(new.buyer_id, 'loja_first_selado');
    end if;

  elsif new.status in ('cancelado','expirado') and old.status = 'reservado' then
    update store_items set
      qty_reserved = greatest(qty_reserved - new.qty, 0),
      updated_at = now()
    where id = new.item_id;
  end if;

  update store_items set status = 'esgotado', updated_at = now()
    where id = new.item_id and status = 'ativo'
      and (qty_total - qty_reserved - qty_sold) <= 0;

  return new;
end;
$$;

-- o trigger em si (trg_store_reservation_after_update) já existe e
-- continua apontando pra esta função — não precisa recriar o trigger,
-- só a função (create or replace acima já é suficiente).


-- ================================================================
-- Pra conferir depois de rodar:
--   select * from xp_event_log where user_id = auth.uid() order by created_at desc limit 20;
--   select * from achievements where category in ('wild_catch','leilao','loja') order by category, xp_bonus;
--   select code from achievements group by code having count(*) > 1; -- deve vir vazio
-- ================================================================
