-- ================================================================
-- wild_backpack_setup.sql — Mochila + stats individuais (MyDeck)
-- ================================================================
-- Adiciona ao minigame de captura (wild_pokemon.js / catch_wild_pokemon):
--   1. Tabela wild_backpack — 1 linha por Pokémon INDIVIDUAL capturado
--      (diferente de wild_catches, que é por espécie).
--   2. Rolagem de stats (HP/Ataque/Defesa/Agilidade/Crítico) dentro da
--      própria RPC catch_wild_pokemon — servidor decide, client só exibe
--      (mesmo padrão anti-cheat do resto do projeto).
--   3. Mochila com capacidade de 20 — se estiver cheia, a captura ainda
--      conta pra Pokédex/XP/conquistas normalmente, só não ganha slot;
--      p_release_id permite liberar 1 slot e guardar o novo na mesma
--      chamada (fluxo de "mochila cheia" no client).
--   4. rename_wild_pokemon — apelido editável, sem tocar em stats (RPC
--      própria; NÃO existe policy de UPDATE direta na tabela pra ninguém
--      conseguir reescrever os próprios stats pelo console — isso importa
--      porque esses stats vão alimentar o sistema de batalha entre
--      usuários no futuro).
--
-- Rodar no SQL Editor do Supabase DEPOIS de wild_pokemon_setup.sql,
-- wild_daily_setup.sql e xp_events_migration_23ago2026.sql (usa
-- wp_catch_rate, wp_xp_for_rarity, xp_award, xp_unlock_achievement e a
-- tabela achievements que essa migração já criou).
-- ================================================================


-- ── 1. Tabela wild_backpack ─────────────────────────────────────
create table if not exists wild_backpack (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  pokemon_slug text not null,
  dex          smallint not null,
  rarity       text not null,
  hp           smallint not null,
  atk          smallint not null,
  def          smallint not null,
  spd          smallint not null,
  crit         smallint not null,
  exceptional  boolean generated always as (
    hp >= 85 and atk >= 85 and def >= 85 and spd >= 85 and crit >= 85
  ) stored,
  nickname     text,
  caught_at    timestamptz not null default now()
);

alter table wild_backpack enable row level security;

-- Só SELECT direto do client. Insert/update de stats/delete só pelas
-- RPCs abaixo (security definer) — de propósito, pra ninguém conseguir
-- reescrever os próprios stats ou criar um indivíduo "na mão".
drop policy if exists "wild_backpack_select_own" on wild_backpack;
create policy "wild_backpack_select_own" on wild_backpack
  for select using (user_id = auth.uid());

create index if not exists wild_backpack_user_idx on wild_backpack (user_id, caught_at desc);


-- ── 2. Rolagem de stats ──────────────────────────────────────────
-- Soma de 2 sorteios uniformes ÷ 2 em vez de sorteio uniforme puro — puxa
-- o resultado pro meio, então extremos (e principalmente os 5 stats altos
-- ao mesmo tempo) já saem raros sozinhos, sem precisar de teto artificial.
create or replace function wp_roll_stat(p_bonus int)
returns smallint
language sql
volatile
as $$
  select greatest(1, least(100,
    round(((random() + random()) / 2) * 100 + p_bonus)
  ))::smallint;
$$;

-- Empurrão pequeno na média conforme a raridade da espécie — não garante
-- nada, só inclina a distribuição (comum ainda pode rolar Excepcional,
-- só que é mais raro que numa ultra-rara).
create or replace function wp_rarity_stat_bonus(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'comum' then 0
    when 'rara' then 5
    when 'especial' then 10
    when 'ultra_rara' then 18
    else 0
  end;
$$;


-- ── 3. Conquista nova: indivíduo Excepcional ────────────────────
insert into achievements (code, title, description, icon, category, xp_bonus) values
  ('wild_exceptional_catch', 'Espécime Perfeito', 'Capture um Pokémon com os 5 stats (HP/Ataque/Defesa/Agilidade/Crítico) acima de 85.', '💠', 'wild_catch', 200)
on conflict (code) do nothing;


-- ── 4. catch_wild_pokemon — estendida com mochila + stats ───────
-- Muda a assinatura (novo parâmetro p_release_id) — precisa dropar a
-- versão antiga antes de recriar, senão o Postgres cria uma SEGUNDA
-- função sobrecarregada em vez de substituir, e o PostgREST não sabe
-- mais qual delas chamar.
drop function if exists catch_wild_pokemon(text, smallint, text, text);

create or replace function catch_wild_pokemon(
  p_pokemon_slug text,
  p_dex smallint,
  p_rarity text,
  p_tier text,
  p_release_id uuid default null
)
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
  v_backpack_cap   constant int := 20;
  v_backpack_count int;
  v_bp             wild_backpack%rowtype;
  v_backpack_full  boolean := false;
  v_bonus          int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  if p_tier not in ('pokeball','greatball','ultraball','masterball') then raise exception 'Bola inválida.'; end if;
  if p_rarity not in ('comum','rara','especial','ultra_rara') then raise exception 'Raridade inválida.'; end if;

  -- Libera 1 slot da mochila ANTES de checar capacidade, se foi pedido
  -- (fluxo de "mochila cheia" — client escolheu qual liberar pra guardar
  -- o novo). Só apaga se for do próprio usuário.
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

    -- ── Mochila: rola os 5 stats e guarda o indivíduo — SEMPRE.
    -- A captura nunca se perde por causa de espaço; "cheia" é só um aviso
    -- pro client sugerir liberar alguém, nunca um bloqueio (evita ter que
    -- rechamar catch_wild_pokemon — que gastaria outra bola e rolaria a
    -- captura de novo — só pra "confirmar" um Pokémon que já foi pego).
    v_bonus := wp_rarity_stat_bonus(p_rarity);
    insert into wild_backpack (user_id, pokemon_slug, dex, rarity, hp, atk, def, spd, crit)
    values (
      auth.uid(), p_pokemon_slug, p_dex, p_rarity,
      wp_roll_stat(v_bonus), wp_roll_stat(v_bonus), wp_roll_stat(v_bonus),
      wp_roll_stat(v_bonus), wp_roll_stat(v_bonus)
    )
    returning * into v_bp;

    if v_bp.exceptional then
      perform xp_unlock_achievement(auth.uid(), 'wild_exceptional_catch');
    end if;

    select count(*) into v_backpack_count from wild_backpack where user_id = auth.uid();
    v_backpack_full := v_backpack_count > v_backpack_cap; -- aviso, não bloqueio
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
grant execute on function catch_wild_pokemon(text, smallint, text, text, uuid) to authenticated;


-- ── 5. release_wild_pokemon — liberar 1 indivíduo da mochila ────
create or replace function release_wild_pokemon(p_backpack_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  delete from wild_backpack where id = p_backpack_id and user_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;
grant execute on function release_wild_pokemon(uuid) to authenticated;


-- ── 6. rename_wild_pokemon — apelido editável (nunca mexe em stats) ──
-- nickname NULL = client mostra o nome normal da espécie (fallback).
-- Passar string vazia limpa o apelido de volta pro nome normal.
create or replace function rename_wild_pokemon(p_backpack_id uuid, p_nickname text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  v_clean   text;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  v_clean := nullif(trim(p_nickname), '');
  if v_clean is not null and length(v_clean) > 24 then
    raise exception 'Apelido muito longo (máx. 24 caracteres).';
  end if;

  update wild_backpack set nickname = v_clean
  where id = p_backpack_id and user_id = auth.uid();
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
grant execute on function rename_wild_pokemon(uuid, text) to authenticated;
