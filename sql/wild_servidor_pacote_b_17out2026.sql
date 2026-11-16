-- ================================================================
-- MyDeck — Minigame "Pokémon Escondidos": pacote B (servidor) — 17/10/2026
-- ================================================================
-- Fecha as brechas encontradas na auditoria do minigame:
--   1) wild_balls / wild_catches / wild_daily aceitavam INSERT/UPDATE direto de qualquer usuário logado
--      (dava pra se dar Master Balls pelo console). Agora a escrita só passa pelas funções abaixo.
--   2) catch_wild_pokemon confiava em slug/dex/raridade vindos do navegador. Agora o servidor valida contra
--      wild_species (os 151 de Kanto) e usa a raridade/dex DA TABELA, ignorando o que o cliente mandou.
--   3) catch_wild_pokemon e battle_random_opponent não tinham limite. Agora: mín. 2 s entre tentativas de
--      captura, até 500 tentativas/dia, até 60 batalhas/dia (valores no topo de cada função).
--   4) Bola de uso passivo (até 5/dia) e bônus de 1º acesso do dia (1 Great Ball) passam a ser decididos aqui.
--
-- Ordem de aplicação (sem pressa, mas na sequência): 1) este SQL  2) publicar o wild_pokemon.js novo.
-- Enquanto só um dos dois estiver no ar, o jogo continua funcionando; o que pára é só ganhar bolas passivas /
-- bônus diário (o cliente antigo tenta gravar direto e leva "permission denied" — nada quebra na tela).
-- Capturas e batalhas não dependem da ordem.
--
-- NÃO mexe em: saldos de bolas existentes, capturas, mochilas, loadouts, ranking.
-- "Dia" = data em America/Sao_Paulo.
-- ================================================================

-- ── 1) Catálogo oficial (referência pública, só leitura) ──────────────────────
create table if not exists public.wild_species (
  slug   text primary key,
  dex    smallint not null unique check (dex between 1 and 151),
  rarity text not null check (rarity in ('comum','rara','especial','ultra_rara')),
  name   text not null
);
alter table public.wild_species enable row level security;
drop policy if exists wild_species_read on public.wild_species;
create policy wild_species_read on public.wild_species for select using (true);
revoke all on public.wild_species from anon, authenticated;
grant select on public.wild_species to anon, authenticated;

insert into public.wild_species (slug, dex, rarity, name) values
  ('bulbasaur',1,'comum','Bulbasaur'),
  ('ivysaur',2,'comum','Ivysaur'),
  ('venusaur',3,'especial','Venusaur'),
  ('charmander',4,'comum','Charmander'),
  ('charmeleon',5,'comum','Charmeleon'),
  ('charizard',6,'especial','Charizard'),
  ('squirtle',7,'comum','Squirtle'),
  ('wartortle',8,'comum','Wartortle'),
  ('blastoise',9,'especial','Blastoise'),
  ('caterpie',10,'comum','Caterpie'),
  ('metapod',11,'comum','Metapod'),
  ('butterfree',12,'rara','Butterfree'),
  ('weedle',13,'comum','Weedle'),
  ('kakuna',14,'comum','Kakuna'),
  ('beedrill',15,'rara','Beedrill'),
  ('pidgey',16,'comum','Pidgey'),
  ('pidgeotto',17,'comum','Pidgeotto'),
  ('pidgeot',18,'rara','Pidgeot'),
  ('rattata',19,'comum','Rattata'),
  ('raticate',20,'rara','Raticate'),
  ('spearow',21,'comum','Spearow'),
  ('fearow',22,'rara','Fearow'),
  ('ekans',23,'comum','Ekans'),
  ('arbok',24,'rara','Arbok'),
  ('pikachu',25,'comum','Pikachu'),
  ('raichu',26,'rara','Raichu'),
  ('sandshrew',27,'comum','Sandshrew'),
  ('sandslash',28,'rara','Sandslash'),
  ('nidoran-f',29,'comum','Nidoran♀'),
  ('nidorina',30,'comum','Nidorina'),
  ('nidoqueen',31,'rara','Nidoqueen'),
  ('nidoran-m',32,'comum','Nidoran♂'),
  ('nidorino',33,'comum','Nidorino'),
  ('nidoking',34,'rara','Nidoking'),
  ('clefairy',35,'comum','Clefairy'),
  ('clefable',36,'rara','Clefable'),
  ('vulpix',37,'comum','Vulpix'),
  ('ninetales',38,'rara','Ninetales'),
  ('jigglypuff',39,'comum','Jigglypuff'),
  ('wigglytuff',40,'rara','Wigglytuff'),
  ('zubat',41,'comum','Zubat'),
  ('golbat',42,'rara','Golbat'),
  ('oddish',43,'comum','Oddish'),
  ('gloom',44,'comum','Gloom'),
  ('vileplume',45,'rara','Vileplume'),
  ('paras',46,'comum','Paras'),
  ('parasect',47,'rara','Parasect'),
  ('venonat',48,'comum','Venonat'),
  ('venomoth',49,'rara','Venomoth'),
  ('diglett',50,'comum','Diglett'),
  ('dugtrio',51,'rara','Dugtrio'),
  ('meowth',52,'comum','Meowth'),
  ('persian',53,'rara','Persian'),
  ('psyduck',54,'comum','Psyduck'),
  ('golduck',55,'rara','Golduck'),
  ('mankey',56,'comum','Mankey'),
  ('primeape',57,'rara','Primeape'),
  ('growlithe',58,'comum','Growlithe'),
  ('arcanine',59,'rara','Arcanine'),
  ('poliwag',60,'comum','Poliwag'),
  ('poliwhirl',61,'comum','Poliwhirl'),
  ('poliwrath',62,'rara','Poliwrath'),
  ('abra',63,'comum','Abra'),
  ('kadabra',64,'comum','Kadabra'),
  ('alakazam',65,'especial','Alakazam'),
  ('machop',66,'comum','Machop'),
  ('machoke',67,'comum','Machoke'),
  ('machamp',68,'especial','Machamp'),
  ('bellsprout',69,'comum','Bellsprout'),
  ('weepinbell',70,'comum','Weepinbell'),
  ('victreebel',71,'rara','Victreebel'),
  ('tentacool',72,'comum','Tentacool'),
  ('tentacruel',73,'rara','Tentacruel'),
  ('geodude',74,'comum','Geodude'),
  ('graveler',75,'comum','Graveler'),
  ('golem',76,'especial','Golem'),
  ('ponyta',77,'comum','Ponyta'),
  ('rapidash',78,'rara','Rapidash'),
  ('slowpoke',79,'comum','Slowpoke'),
  ('slowbro',80,'rara','Slowbro'),
  ('magnemite',81,'comum','Magnemite'),
  ('magneton',82,'rara','Magneton'),
  ('farfetchd',83,'rara','Farfetch''d'),
  ('doduo',84,'comum','Doduo'),
  ('dodrio',85,'rara','Dodrio'),
  ('seel',86,'comum','Seel'),
  ('dewgong',87,'rara','Dewgong'),
  ('grimer',88,'comum','Grimer'),
  ('muk',89,'rara','Muk'),
  ('shellder',90,'comum','Shellder'),
  ('cloyster',91,'rara','Cloyster'),
  ('gastly',92,'comum','Gastly'),
  ('haunter',93,'comum','Haunter'),
  ('gengar',94,'especial','Gengar'),
  ('onix',95,'rara','Onix'),
  ('drowzee',96,'comum','Drowzee'),
  ('hypno',97,'rara','Hypno'),
  ('krabby',98,'comum','Krabby'),
  ('kingler',99,'rara','Kingler'),
  ('voltorb',100,'comum','Voltorb'),
  ('electrode',101,'rara','Electrode'),
  ('exeggcute',102,'comum','Exeggcute'),
  ('exeggutor',103,'rara','Exeggutor'),
  ('cubone',104,'comum','Cubone'),
  ('marowak',105,'rara','Marowak'),
  ('hitmonlee',106,'rara','Hitmonlee'),
  ('hitmonchan',107,'rara','Hitmonchan'),
  ('lickitung',108,'rara','Lickitung'),
  ('koffing',109,'comum','Koffing'),
  ('weezing',110,'rara','Weezing'),
  ('rhyhorn',111,'comum','Rhyhorn'),
  ('rhydon',112,'rara','Rhydon'),
  ('chansey',113,'especial','Chansey'),
  ('tangela',114,'rara','Tangela'),
  ('kangaskhan',115,'especial','Kangaskhan'),
  ('horsea',116,'comum','Horsea'),
  ('seadra',117,'rara','Seadra'),
  ('goldeen',118,'comum','Goldeen'),
  ('seaking',119,'rara','Seaking'),
  ('staryu',120,'comum','Staryu'),
  ('starmie',121,'rara','Starmie'),
  ('mr-mime',122,'rara','Mr. Mime'),
  ('scyther',123,'especial','Scyther'),
  ('jynx',124,'rara','Jynx'),
  ('electabuzz',125,'rara','Electabuzz'),
  ('magmar',126,'rara','Magmar'),
  ('pinsir',127,'especial','Pinsir'),
  ('tauros',128,'especial','Tauros'),
  ('magikarp',129,'comum','Magikarp'),
  ('gyarados',130,'especial','Gyarados'),
  ('lapras',131,'especial','Lapras'),
  ('ditto',132,'especial','Ditto'),
  ('eevee',133,'comum','Eevee'),
  ('vaporeon',134,'especial','Vaporeon'),
  ('jolteon',135,'especial','Jolteon'),
  ('flareon',136,'especial','Flareon'),
  ('porygon',137,'especial','Porygon'),
  ('omanyte',138,'comum','Omanyte'),
  ('omastar',139,'rara','Omastar'),
  ('kabuto',140,'comum','Kabuto'),
  ('kabutops',141,'rara','Kabutops'),
  ('aerodactyl',142,'especial','Aerodactyl'),
  ('snorlax',143,'especial','Snorlax'),
  ('articuno',144,'ultra_rara','Articuno'),
  ('zapdos',145,'ultra_rara','Zapdos'),
  ('moltres',146,'ultra_rara','Moltres'),
  ('dratini',147,'comum','Dratini'),
  ('dragonair',148,'comum','Dragonair'),
  ('dragonite',149,'ultra_rara','Dragonite'),
  ('mewtwo',150,'ultra_rara','Mewtwo'),
  ('mew',151,'ultra_rara','Mew')
on conflict (slug) do update set dex = excluded.dex, rarity = excluded.rarity, name = excluded.name;

-- ── 2) Contadores diários no servidor ─────────────────────────────────────────
alter table public.wild_daily
  add column if not exists catch_attempts int not null default 0,
  add column if not exists battles        int not null default 0,
  add column if not exists last_catch_at   timestamptz,
  add column if not exists last_passive_at timestamptz;

-- Linha de hoje do usuário (zera os contadores quando vira o dia). Uso interno das funções abaixo.
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
    battles             = case when public.wild_daily.day = excluded.day then public.wild_daily.battles             else 0 end
  returning * into r;
  return r;
end;
$$;
revoke all on function public.wild_daily_touch(uuid) from public, anon, authenticated;

-- ── 3) Bolas: criar saldo inicial, bônus diário e ganho passivo ───────────────
create or replace function public.wild_init_balls()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.wild_balls;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  insert into public.wild_balls (user_id) values (auth.uid()) on conflict (user_id) do nothing;   -- defaults da tabela: 5/2/1/0
  select * into b from public.wild_balls where user_id = auth.uid();
  return jsonb_build_object('pokeball', b.pokeball, 'greatball', b.greatball, 'ultraball', b.ultraball, 'masterball', b.masterball);
end;
$$;

create or replace function public.wild_claim_daily_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.wild_daily; b public.wild_balls;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  perform public.wild_init_balls();
  r := public.wild_daily_touch(auth.uid());
  if r.login_bonus_claimed then
    select * into b from public.wild_balls where user_id = auth.uid();
    return jsonb_build_object('granted', false, 'balls', jsonb_build_object('pokeball', b.pokeball, 'greatball', b.greatball, 'ultraball', b.ultraball, 'masterball', b.masterball));
  end if;
  update public.wild_daily set login_bonus_claimed = true, updated_at = now() where user_id = auth.uid();
  update public.wild_balls set greatball = greatball + 1, updated_at = now() where user_id = auth.uid() returning * into b;
  return jsonb_build_object('granted', true, 'tier', 'greatball', 'balls', jsonb_build_object('pokeball', b.pokeball, 'greatball', b.greatball, 'ultraball', b.ultraball, 'masterball', b.masterball));
end;
$$;

create or replace function public.wild_grant_passive_ball()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_cap constant int      := 5;                     -- Poké Balls por dia só por usar o site
  c_min_gap   constant interval := interval '60 seconds'; -- intervalo mínimo entre dois ganhos
  r public.wild_daily; b public.wild_balls;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  perform public.wild_init_balls();
  r := public.wild_daily_touch(auth.uid());
  if r.passive_balls >= c_daily_cap then
    return jsonb_build_object('granted', false, 'reason', 'teto_diario');
  end if;
  if r.last_passive_at is not null and now() - r.last_passive_at < c_min_gap then
    return jsonb_build_object('granted', false, 'reason', 'muito_cedo');
  end if;
  update public.wild_daily set passive_balls = passive_balls + 1, last_passive_at = now(), updated_at = now() where user_id = auth.uid();
  update public.wild_balls set pokeball = pokeball + 1, updated_at = now() where user_id = auth.uid() returning * into b;
  return jsonb_build_object('granted', true, 'tier', 'pokeball', 'balls', jsonb_build_object('pokeball', b.pokeball, 'greatball', b.greatball, 'ultraball', b.ultraball, 'masterball', b.masterball));
end;
$$;

-- ── 4) Captura: valida a espécie no servidor + limites ────────────────────────
create or replace function public.catch_wild_pokemon(p_pokemon_slug text, p_dex smallint, p_rarity text, p_tier text, p_release_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_min_gap      constant interval := interval '2 seconds';   -- intervalo mínimo entre duas tentativas
  c_daily_max    constant int      := 500;                    -- tentativas por dia (a cadência normal é ~384 aparições/dia)
  v_balls          wild_balls%rowtype;
  v_sp             wild_species%rowtype;
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

  -- 17/10/2026: espécie, dex e raridade vêm da TABELA, não do navegador (p_dex e p_rarity são ignorados).
  select * into v_sp from wild_species where slug = p_pokemon_slug;
  if not found then raise exception 'Pokémon desconhecido.'; end if;

  v_day := wild_daily_touch(auth.uid());
  if v_day.catch_attempts >= c_daily_max then raise exception 'Limite diário de tentativas de captura atingido — volte amanhã.'; end if;
  if v_day.last_catch_at is not null and now() - v_day.last_catch_at < c_min_gap then raise exception 'Calma! Espere um instante antes de tentar de novo.'; end if;
  update wild_daily set catch_attempts = catch_attempts + 1, last_catch_at = now(), updated_at = now() where user_id = auth.uid();

  -- Libera 1 slot da mochila ANTES de checar capacidade, se foi pedido (só apaga se for do próprio usuário).
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

    -- Mochila: rola os 5 stats e guarda o indivíduo — SEMPRE ("cheia" é só aviso, nunca bloqueio).
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

  return jsonb_build_object(
    'success',        v_success,
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

-- ── 5) Batalha: mesma lógica de antes + limite diário ─────────────────────────
create or replace function public.battle_random_opponent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_max constant int := 60;     -- batalhas por dia (cada uma leva ~20 s na tela; 192 em um dia já foi visto)
  v_me       wild_loadout%rowtype;
  v_opp      wild_loadout%rowtype;
  v_day      wild_daily%rowtype;
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

  select * into v_opp
  from wild_loadout
  where user_id <> auth.uid()
    and principal_id is not null
    and array_length(team_ids, 1) = 3
  order by random()
  limit 1;

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

-- ── 6) Grants das funções novas / reescritas ──────────────────────────────────
revoke all on function public.wild_init_balls()          from public, anon;
revoke all on function public.wild_claim_daily_bonus()   from public, anon;
revoke all on function public.wild_grant_passive_ball()  from public, anon;
revoke all on function public.catch_wild_pokemon(text, smallint, text, text, uuid) from public, anon;
revoke all on function public.battle_random_opponent()  from public, anon;
grant execute on function public.wild_init_balls()          to authenticated;
grant execute on function public.wild_claim_daily_bonus()   to authenticated;
grant execute on function public.wild_grant_passive_ball()  to authenticated;
grant execute on function public.catch_wild_pokemon(text, smallint, text, text, uuid) to authenticated;
grant execute on function public.battle_random_opponent()  to authenticated;

-- ── 7) Trava a escrita direta ─────────────────────────────────────────────────
drop policy if exists wild_balls_insert_own   on public.wild_balls;
drop policy if exists wild_balls_update_own   on public.wild_balls;
drop policy if exists wild_catches_insert_own on public.wild_catches;
drop policy if exists wild_catches_update_own on public.wild_catches;
drop policy if exists wild_daily_insert_own   on public.wild_daily;
drop policy if exists wild_daily_update_own   on public.wild_daily;
revoke insert, update, delete, truncate on public.wild_balls, public.wild_catches, public.wild_daily from anon, authenticated;
-- (a leitura própria continua: policies *_select_own e o privilégio SELECT não foram tocados)
