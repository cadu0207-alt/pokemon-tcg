-- ================================================================
-- MyDeck — Minigame "Pokémon Escondidos": pacote C (servidor) — 17/10/2026
-- ================================================================
-- Depende do pacote B (wild_servidor_pacote_b_17out2026.sql) já aplicado.
--
--   1) SPAWN NO SERVIDOR: quem sorteia o Pokémon que aparece é o servidor (wild_spawn). Cada aparição vira um
--      registro de USO ÚNICO e validade curta; catch_wild_pokemon só aceita capturar um spawn válido, seu e
--      ainda não usado. Acabou o "escolho a espécie que quiser" e a cadência vira regra (mín. 20 s entre
--      aparições, até 450 por dia, mesmos pesos do cliente).
--   2) BOLAS COMO RECOMPENSA: conquistas do site (coleção, leilão, loja, master set, minigame) concedem
--      pokébolas pela tabela wild_ball_rewards (editável por SQL). Um gatilho em user_achievements faz a
--      concessão — cobre qualquer conquista, hoje e no futuro. Só vale para conquistas desbloqueadas a partir
--      de agora (não retroativo; há um comando opcional no fim do arquivo).
--   3) BATALHA MAIS JUSTA: o rival sai entre os 5 de poder mais próximo (poder = média dos stats do Principal
--      + Equipe); antes era sorteado entre todos.
--   4) RANKING POR TAXA DE VITÓRIA: ordena por % de vitórias, com mínimo de partidas no período (dia 3, semana
--      10, mês 15, total 30); mostra vitórias, derrotas e %. O ranking antigo (só contagem de vitórias)
--      premiava quem mais clicava.
--
-- Não mexe em: saldos de bolas, capturas, mochilas, loadouts, wild_battle_log.
-- "Dia" = data em America/Sao_Paulo.
-- ================================================================

-- ── 1) Spawn ────────────────────────────────────────────────────────────────
alter table public.wild_daily
  add column if not exists spawns        int not null default 0,
  add column if not exists last_spawn_at timestamptz;

create or replace function public.wild_daily_touch(p_user uuid)
returns public.wild_daily
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r public.wild_daily;
begin
  insert into public.wild_daily (user_id, day) values (p_user, v_today)
  on conflict (user_id) do update set
    day                 = excluded.day,
    passive_balls       = case when public.wild_daily.day = excluded.day then public.wild_daily.passive_balls       else 0 end,
    login_bonus_claimed = case when public.wild_daily.day = excluded.day then public.wild_daily.login_bonus_claimed else false end,
    catch_attempts      = case when public.wild_daily.day = excluded.day then public.wild_daily.catch_attempts      else 0 end,
    battles             = case when public.wild_daily.day = excluded.day then public.wild_daily.battles             else 0 end,
    spawns              = case when public.wild_daily.day = excluded.day then public.wild_daily.spawns              else 0 end
  returning * into r;
  return r;
end;
$$;
revoke all on function public.wild_daily_touch(uuid) from public, anon, authenticated;

create table if not exists public.wild_spawns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  slug       text not null references public.wild_species(slug),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists wild_spawns_user_idx on public.wild_spawns (user_id, created_at desc);
alter table public.wild_spawns enable row level security;
revoke all on public.wild_spawns from anon, authenticated;

create or replace function public.wild_spawn()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_max constant int      := 450;                  -- aparições por dia (a cadência normal é ~384)
  c_min_gap   constant interval := interval '20 seconds';
  c_ttl       constant interval := interval '60 seconds'; -- tempo pra clicar e jogar a bola
  v_day  public.wild_daily;
  v_slug text;
  v_dex  smallint;
  v_id   uuid;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  v_day := public.wild_daily_touch(auth.uid());
  if v_day.spawns >= c_daily_max then return jsonb_build_object('ok', false, 'reason', 'teto_diario'); end if;
  if v_day.last_spawn_at is not null and now() - v_day.last_spawn_at < c_min_gap then
    return jsonb_build_object('ok', false, 'reason', 'muito_cedo');
  end if;

  -- sorteio ponderado (mesmos pesos do cliente: cada espécie pesa o alvo diário da sua raridade)
  select s.slug, s.dex into v_slug, v_dex
  from public.wild_species s
  order by -ln(1 - random()) / (case s.rarity when 'comum' then 240 when 'rara' then 86 when 'especial' then 34 else 24 end)
  limit 1;

  delete from public.wild_spawns where created_at < now() - interval '1 day';
  insert into public.wild_spawns (user_id, slug, expires_at) values (auth.uid(), v_slug, now() + c_ttl) returning id into v_id;
  update public.wild_daily set spawns = spawns + 1, last_spawn_at = now(), updated_at = now() where user_id = auth.uid();

  return jsonb_build_object('ok', true, 'spawn_id', v_id, 'slug', v_slug, 'dex', v_dex);
end;
$$;

-- catch_wild_pokemon: agora exige um spawn válido (assinatura nova; a de 5 argumentos sai pra não haver ambiguidade)
drop function if exists public.catch_wild_pokemon(text, smallint, text, text, uuid);

create or replace function public.catch_wild_pokemon(p_pokemon_slug text, p_dex smallint, p_rarity text, p_tier text, p_release_id uuid default null, p_spawn_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_min_gap      constant interval := interval '2 seconds';
  c_daily_max    constant int      := 500;
  v_balls          wild_balls%rowtype;
  v_sp             wild_species%rowtype;
  v_spawn          wild_spawns%rowtype;
  v_day            wild_daily%rowtype;
  v_chance         numeric;
  v_success        boolean;
  v_rec            wild_catches%rowtype;
  v_prog           user_progress%rowtype;
  v_distinct_count int;
  v_ultra_count    int;
  v_backpack_cap   constant int := 20;
  v_backpack_count int;
  v_bp             wild_backpack%rowtype;
  v_backpack_full  boolean := false;
  v_bonus          int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  if p_tier not in ('pokeball','greatball','ultraball','masterball') then raise exception 'Bola inválida.'; end if;
  if p_spawn_id is null then raise exception 'Atualize a página (Ctrl+F5) pra continuar jogando.'; end if;

  -- o Pokémon vem do spawn (sorteado pelo servidor): slug/dex/raridade do navegador são ignorados
  select * into v_spawn from wild_spawns where id = p_spawn_id and user_id = auth.uid() for update;
  if not found or v_spawn.used_at is not null or v_spawn.expires_at < now() then
    raise exception 'Esse Pokémon já foi embora.';
  end if;
  select * into v_sp from wild_species where slug = v_spawn.slug;

  v_day := wild_daily_touch(auth.uid());
  if v_day.catch_attempts >= c_daily_max then raise exception 'Limite diário de tentativas de captura atingido — volte amanhã.'; end if;
  if v_day.last_catch_at is not null and now() - v_day.last_catch_at < c_min_gap then raise exception 'Calma! Espere um instante antes de tentar de novo.'; end if;
  update wild_daily set catch_attempts = catch_attempts + 1, last_catch_at = now(), updated_at = now() where user_id = auth.uid();

  if p_release_id is not null then
    delete from wild_backpack where id = p_release_id and user_id = auth.uid();
  end if;

  select * into v_balls from wild_balls where user_id = auth.uid() for update;
  if not found then raise exception 'Você ainda não tem pokébolas.'; end if;

  if (p_tier='pokeball'   and v_balls.pokeball   < 1)
  or (p_tier='greatball'  and v_balls.greatball  < 1)
  or (p_tier='ultraball'  and v_balls.ultraball  < 1)
  or (p_tier='masterball' and v_balls.masterball < 1) then
    raise exception 'Você não tem mais dessa pokébola.';
  end if;

  update wild_spawns set used_at = now() where id = v_spawn.id;   -- um arremesso por aparição (acertando ou não)
  update wild_balls set
    pokeball   = pokeball   - case when p_tier='pokeball'   then 1 else 0 end,
    greatball  = greatball  - case when p_tier='greatball'  then 1 else 0 end,
    ultraball  = ultraball  - case when p_tier='ultraball'  then 1 else 0 end,
    masterball = masterball - case when p_tier='masterball' then 1 else 0 end,
    updated_at = now()
  where user_id = auth.uid()
  returning * into v_balls;

  v_chance  := wp_catch_rate(p_tier, v_sp.rarity);
  v_success := random() < v_chance;

  if v_success then
    insert into wild_catches (user_id, pokemon_slug, dex, rarity, count, first_caught_at, last_caught_at)
    values (auth.uid(), v_sp.slug, v_sp.dex, v_sp.rarity, 1, now(), now())
    on conflict (user_id, pokemon_slug) do update
      set count = wild_catches.count + 1, last_caught_at = now()
    returning * into v_rec;

    perform xp_award(auth.uid(), 'wild_catch', gen_random_uuid()::text, wp_xp_for_rarity(v_sp.rarity));

    if p_tier = 'masterball' then
      perform xp_unlock_achievement(auth.uid(), 'wild_masterball_catch');
    end if;

    select count(*) into v_distinct_count from wild_catches where user_id = auth.uid();
    if v_distinct_count = 1   then perform xp_unlock_achievement(auth.uid(), 'wild_first_catch'); end if;
    if v_distinct_count = 10  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_10');   end if;
    if v_distinct_count = 50  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_50');   end if;
    if v_distinct_count = 151 then perform xp_unlock_achievement(auth.uid(), 'wild_catch_150');  end if;

    if v_sp.rarity = 'rara' and not exists (
      select 1 from wild_catches where user_id=auth.uid() and rarity='rara' and pokemon_slug<>v_sp.slug
    ) then
      perform xp_unlock_achievement(auth.uid(), 'wild_first_rara');
    elsif v_sp.rarity = 'especial' and not exists (
      select 1 from wild_catches where user_id=auth.uid() and rarity='especial' and pokemon_slug<>v_sp.slug
    ) then
      perform xp_unlock_achievement(auth.uid(), 'wild_first_especial');
    elsif v_sp.rarity = 'ultra_rara' then
      if not exists (
        select 1 from wild_catches where user_id=auth.uid() and rarity='ultra_rara' and pokemon_slug<>v_sp.slug
      ) then
        perform xp_unlock_achievement(auth.uid(), 'wild_first_ultra');
      end if;
      select count(*) into v_ultra_count from wild_catches where user_id=auth.uid() and rarity='ultra_rara';
      if v_ultra_count = 6 then perform xp_unlock_achievement(auth.uid(), 'wild_all_ultra'); end if;
    end if;

    v_bonus := wp_rarity_stat_bonus(v_sp.rarity);
    insert into wild_backpack (user_id, pokemon_slug, dex, rarity, hp, atk, def, spd, crit)
    values (
      auth.uid(), v_sp.slug, v_sp.dex, v_sp.rarity,
      wp_roll_stat(v_bonus), wp_roll_stat(v_bonus), wp_roll_stat(v_bonus),
      wp_roll_stat(v_bonus), wp_roll_stat(v_bonus)
    )
    returning * into v_bp;

    if v_bp.exceptional then
      perform xp_unlock_achievement(auth.uid(), 'wild_exceptional_catch');
    end if;

    select count(*) into v_backpack_count from wild_backpack where user_id = auth.uid();
    v_backpack_full := v_backpack_count > v_backpack_cap;
  end if;

  select * into v_prog from user_progress where user_id = auth.uid();
  -- saldo atualizado (uma conquista dessa captura pode ter concedido bolas pelo gatilho de recompensas)
  select * into v_balls from wild_balls where user_id = auth.uid();

  return jsonb_build_object(
    'success',        v_success,
    'slug',           v_sp.slug,
    'balls',          jsonb_build_object('pokeball', v_balls.pokeball, 'greatball', v_balls.greatball, 'ultraball', v_balls.ultraball, 'masterball', v_balls.masterball),
    'count',          v_rec.count,
    'total_xp',       coalesce(v_prog.total_xp, 0),
    'level',          coalesce(v_prog.level, 1),
    'backpack_full',  v_backpack_full,
    'backpack_cap',   v_backpack_cap,
    'backpack_count', coalesce(v_backpack_count, 0),
    'backpack_entry', case when v_bp.id is not null then jsonb_build_object(
                         'id', v_bp.id, 'hp', v_bp.hp, 'atk', v_bp.atk, 'def', v_bp.def,
                         'spd', v_bp.spd, 'crit', v_bp.crit, 'exceptional', v_bp.exceptional
                       ) else null end
  );
end;
$$;

-- ── 2) Bolas como recompensa de conquista ───────────────────────────────────
create table if not exists public.wild_ball_rewards (
  code text primary key references public.achievements(code) on delete cascade,
  tier text not null check (tier in ('pokeball','greatball','ultraball','masterball')),
  qty  int  not null default 1 check (qty between 1 and 50)
);
alter table public.wild_ball_rewards enable row level security;
revoke all on public.wild_ball_rewards from anon, authenticated;

-- Tabela inicial (ajuste à vontade por SQL: update wild_ball_rewards set qty = 2 where code = '...')
insert into public.wild_ball_rewards (code, tier, qty)
select v.code, v.tier, v.qty
from (values
  ('first_card','greatball',1), ('custom_binder_first','greatball',1), ('cards_100','greatball',1), ('cards_500','greatball',2),
  ('cards_1000','ultraball',1), ('cards_2500','ultraball',2),
  ('first_set_complete','ultraball',1), ('first_master_set','masterball',1),
  ('master_sets_3','masterball',2), ('master_sets_5','masterball',3), ('master_sets_10','masterball',5),
  ('loja_first_carta','greatball',1), ('loja_first_selado','greatball',1), ('loja_first_purchase','greatball',1), ('loja_purchase_10','ultraball',1),
  ('leilao_first_bid','greatball',1), ('leilao_first_win','ultraball',1), ('leilao_win_5','ultraball',2), ('leilao_win_20','masterball',1),
  ('wild_battle_win_10','ultraball',1), ('wild_all_ultra','masterball',1), ('wild_catch_150','masterball',1)
) as v(code, tier, qty)
join public.achievements a on a.code = v.code
on conflict (code) do update set tier = excluded.tier, qty = excluded.qty;

insert into public.wild_ball_rewards (code, tier, qty)
select a.code, 'ultraball', 1 from public.achievements a where a.code like 'set\_complete\_%'
on conflict (code) do update set tier = excluded.tier, qty = excluded.qty;
insert into public.wild_ball_rewards (code, tier, qty)
select a.code, 'masterball', 1 from public.achievements a where a.code like 'master\_set\_%'
on conflict (code) do update set tier = excluded.tier, qty = excluded.qty;

create or replace function public.wild_reward_balls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r public.wild_ball_rewards;
begin
  select * into r from public.wild_ball_rewards where code = new.achievement_code;
  if not found then return new; end if;
  insert into public.wild_balls (user_id) values (new.user_id) on conflict (user_id) do nothing;
  update public.wild_balls set
    pokeball   = pokeball   + case when r.tier = 'pokeball'   then r.qty else 0 end,
    greatball  = greatball  + case when r.tier = 'greatball'  then r.qty else 0 end,
    ultraball  = ultraball  + case when r.tier = 'ultraball'  then r.qty else 0 end,
    masterball = masterball + case when r.tier = 'masterball' then r.qty else 0 end,
    updated_at = now()
  where user_id = new.user_id;
  return new;
exception when others then
  raise warning 'wild_reward_balls falhou (ignorado, a conquista segue): %', sqlerrm;   -- nunca derruba a conquista
  return new;
end;
$$;
revoke all on function public.wild_reward_balls() from public, anon, authenticated;
drop trigger if exists wild_reward_balls_trg on public.user_achievements;
create trigger wild_reward_balls_trg after insert on public.user_achievements
  for each row execute function public.wild_reward_balls();

-- ── 3) Batalha: rival de poder parecido ────────────────────────────────────
create or replace function public.wp_loadout_power(p_principal uuid, p_team uuid[])
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(avg((hp + atk + def + spd + crit) / 5.0), 0)
  from public.wild_backpack
  where id = p_principal or id = any(coalesce(p_team, '{}'::uuid[]));
$$;
revoke all on function public.wp_loadout_power(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.battle_random_opponent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_max constant int := 60;
  c_pool      constant int := 5;       -- sorteia entre os 5 de poder mais próximo
  v_me       wild_loadout%rowtype;
  v_opp      wild_loadout%rowtype;
  v_day      wild_daily%rowtype;
  v_power    numeric;
  v_format   text;
  v_duels    jsonb := '[]'::jsonb;
  v_duel     jsonb;
  v_wins_a   int := 0;
  v_wins_b   int := 0;
  v_overall  text;
  v_a_mon    jsonb;
  v_b_mon    jsonb;
  v_me_wins  int;
  i          int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;

  select * into v_me from wild_loadout where user_id = auth.uid();
  if not found or v_me.principal_id is null or array_length(v_me.team_ids, 1) <> 3 then
    raise exception 'Defina seu Pokémon Principal e sua Equipe de 3 na mochila antes de batalhar.';
  end if;

  v_day := wild_daily_touch(auth.uid());
  if v_day.battles >= c_daily_max then
    raise exception 'Você já fez % batalhas hoje — volte amanhã.', c_daily_max;
  end if;

  v_power := wp_loadout_power(v_me.principal_id, v_me.team_ids);

  select * into v_opp from wild_loadout
  where user_id = (
    select c.user_id from (
      select l.user_id, abs(wp_loadout_power(l.principal_id, l.team_ids) - v_power) as dist
      from wild_loadout l
      where l.user_id <> auth.uid() and l.principal_id is not null and array_length(l.team_ids, 1) = 3
      order by dist, random()
      limit c_pool
    ) c
    order by random()
    limit 1
  );

  if not found then
    raise exception 'Ninguém mais está pronto pra batalhar ainda — tente de novo daqui a pouco.';
  end if;

  update wild_daily set battles = battles + 1, updated_at = now() where user_id = auth.uid();

  v_format := case when random() < 0.5 then '1x1' else '3x3' end;

  if v_format = '1x1' then
    select jsonb_build_object('dex', dex, 'slug', pokemon_slug, 'hp', hp, 'atk', atk, 'def', def, 'spd', spd, 'crit', crit)
    into v_a_mon from wild_backpack where id = v_me.principal_id;
    select jsonb_build_object('dex', dex, 'slug', pokemon_slug, 'hp', hp, 'atk', atk, 'def', def, 'spd', spd, 'crit', crit)
    into v_b_mon from wild_backpack where id = v_opp.principal_id;

    if v_a_mon is null or v_b_mon is null then
      raise exception 'Seu Pokémon Principal não existe mais na mochila — escolha de novo.';
    end if;

    v_duel := wp_battle_duel(v_a_mon, v_b_mon);
    v_duels := jsonb_build_array(jsonb_build_object('a', v_a_mon, 'b', v_b_mon, 'result', v_duel));
    v_overall := v_duel->>'winner';
  else
    for i in 1..3 loop
      select jsonb_build_object('dex', dex, 'slug', pokemon_slug, 'hp', hp, 'atk', atk, 'def', def, 'spd', spd, 'crit', crit)
      into v_a_mon from wild_backpack where id = v_me.team_ids[i];
      select jsonb_build_object('dex', dex, 'slug', pokemon_slug, 'hp', hp, 'atk', atk, 'def', def, 'spd', spd, 'crit', crit)
      into v_b_mon from wild_backpack where id = v_opp.team_ids[i];

      if v_a_mon is null or v_b_mon is null then
        raise exception 'Algum Pokémon da sua Equipe não existe mais na mochila — revise sua equipe.';
      end if;

      v_duel := wp_battle_duel(v_a_mon, v_b_mon);
      if v_duel->>'winner' = 'a' then v_wins_a := v_wins_a + 1; else v_wins_b := v_wins_b + 1; end if;
      v_duels := v_duels || jsonb_build_object('a', v_a_mon, 'b', v_b_mon, 'result', v_duel);
    end loop;
    v_overall := case when v_wins_a > v_wins_b then 'a' else 'b' end;
  end if;

  if v_overall = 'a' then
    update wild_loadout set wins = wins + 1, updated_at = now() where user_id = auth.uid() returning wins into v_me_wins;
    update wild_loadout set losses = losses + 1, updated_at = now() where user_id = v_opp.user_id;
    insert into wild_battle_log (winner_id, loser_id, format) values (auth.uid(), v_opp.user_id, v_format);
    perform xp_award(auth.uid(), 'wild_battle', gen_random_uuid()::text, 25);
    perform xp_unlock_achievement(auth.uid(), 'wild_battle_first_win');
    if v_me_wins = 10 then perform xp_unlock_achievement(auth.uid(), 'wild_battle_win_10'); end if;
  else
    update wild_loadout set losses = losses + 1, updated_at = now() where user_id = auth.uid();
    update wild_loadout set wins = wins + 1, updated_at = now() where user_id = v_opp.user_id;
    insert into wild_battle_log (winner_id, loser_id, format) values (v_opp.user_id, auth.uid(), v_format);
    perform xp_award(auth.uid(), 'wild_battle', gen_random_uuid()::text, 10);
  end if;

  return jsonb_build_object(
    'format',  v_format,
    'overall', v_overall,
    'duels',   v_duels,
    'my_record', (select jsonb_build_object('wins', wins, 'losses', losses) from wild_loadout where user_id = auth.uid())
  );
end;
$$;

-- ── 4) Ranking por taxa de vitória ─────────────────────────────────────────
drop function if exists public.wild_ranking(text);

create or replace function public.wild_ranking_compute(p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since  timestamptz;
  v_min    int;
  v_result jsonb;
begin
  if p_period = 'day' then v_since := date_trunc('day', now()); v_min := 3;
  elsif p_period = 'week' then v_since := date_trunc('week', now()); v_min := 10;
  elsif p_period = 'month' then v_since := date_trunc('month', now()); v_min := 15;
  elsif p_period = 'all' then v_since := '-infinity'::timestamptz; v_min := 30;
  else raise exception 'Período inválido: %', p_period;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'display_name', t.display_name, 'wins', t.wins, 'losses', t.losses, 'win_rate', t.win_rate, 'min_battles', v_min)
           order by t.win_rate desc, t.wins desc, t.display_name asc), '[]'::jsonb)
  into v_result
  from (
    select coalesce(l.display_name, 'Treinador Anônimo') as display_name, g.wins, g.losses,
           round(g.wins * 100.0 / (g.wins + g.losses), 1) as win_rate
    from (
      select x.uid, sum(x.w)::bigint as wins, sum(x.l)::bigint as losses
      from (
        select winner_id as uid, 1 as w, 0 as l from wild_battle_log where created_at >= v_since
        union all
        select loser_id, 0, 1 from wild_battle_log where created_at >= v_since
      ) x
      group by x.uid
    ) g
    join wild_loadout l on l.user_id = g.uid
    where g.wins + g.losses >= v_min
    order by win_rate desc, g.wins desc
    limit 20
  ) t;

  return v_result;
end;
$$;

create or replace function public.wild_ranking(p_period text)
returns table(display_name text, wins bigint, losses bigint, win_rate numeric, min_battles int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached      jsonb;
  v_computed_at timestamptz;
begin
  if p_period not in ('day','week','month','all') then
    raise exception 'Período inválido: %', p_period;
  end if;

  select c.data, c.computed_at into v_cached, v_computed_at
  from wild_ranking_cache c where c.period = p_period;

  if v_computed_at is null or v_computed_at < now() - interval '10 minutes' then
    v_cached := wild_ranking_compute(p_period);
    insert into wild_ranking_cache (period, data, computed_at)
    values (p_period, v_cached, now())
    on conflict (period) do update set data = excluded.data, computed_at = excluded.computed_at;
  end if;

  return query
  select (elem->>'display_name')::text, (elem->>'wins')::bigint, (elem->>'losses')::bigint,
         (elem->>'win_rate')::numeric, (elem->>'min_battles')::int
  from jsonb_array_elements(v_cached) elem;
end;
$$;
delete from public.wild_ranking_cache;   -- o cache antigo tem o formato velho

-- ── 5) Grants ──────────────────────────────────────────────────────────────
revoke all on function public.wild_spawn() from public, anon;
revoke all on function public.catch_wild_pokemon(text, smallint, text, text, uuid, uuid) from public, anon;
revoke all on function public.battle_random_opponent() from public, anon;
grant execute on function public.wild_spawn() to authenticated;
grant execute on function public.catch_wild_pokemon(text, smallint, text, text, uuid, uuid) to authenticated;
grant execute on function public.battle_random_opponent() to authenticated;
revoke all on function public.wild_ranking(text) from public;
grant execute on function public.wild_ranking(text) to anon, authenticated;   -- como era: o ranking é público

-- ── Opcional (NÃO roda sozinho): dar as recompensas também de quem JÁ tinha as conquistas ──
-- insert into public.wild_balls (user_id) select distinct user_id from public.user_achievements on conflict do nothing;
-- update public.wild_balls b set
--   pokeball   = b.pokeball   + coalesce((select sum(r.qty) from public.user_achievements u join public.wild_ball_rewards r on r.code = u.achievement_code where u.user_id = b.user_id and r.tier = 'pokeball'), 0),
--   greatball  = b.greatball  + coalesce((select sum(r.qty) from public.user_achievements u join public.wild_ball_rewards r on r.code = u.achievement_code where u.user_id = b.user_id and r.tier = 'greatball'), 0),
--   ultraball  = b.ultraball  + coalesce((select sum(r.qty) from public.user_achievements u join public.wild_ball_rewards r on r.code = u.achievement_code where u.user_id = b.user_id and r.tier = 'ultraball'), 0),
--   masterball = b.masterball + coalesce((select sum(r.qty) from public.user_achievements u join public.wild_ball_rewards r on r.code = u.achievement_code where u.user_id = b.user_id and r.tier = 'masterball'), 0);
