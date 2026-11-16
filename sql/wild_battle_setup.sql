-- ================================================================
-- wild_battle_setup.sql — Batalhas 1x1/3x3 entre usuários (MyDeck)
-- ================================================================
-- Pré-requisito pra participar: ter um Pokémon "Principal" (1x1) e uma
-- "Equipe" de 3 (3x3) definidos a partir da própria mochila (wild_backpack).
-- O jogador clica em "Batalhar" — o servidor sorteia um oponente qualquer
-- que também já tenha os dois definidos, sorteia o formato (1x1 ou 3x3) e
-- resolve o combate rodada a rodada usando os 5 stats de cada Pokémon.
-- Todo o cálculo (sorteio de oponente, formato, dano, crítico, vencedor)
-- acontece no servidor — o client só recebe o "replay" pronto (campo
-- `log`/`duels` do retorno) pra animar; nunca decide nada.
--
-- Rodar DEPOIS de wild_backpack_setup.sql (usa a tabela wild_backpack e
-- as funções xp_award/xp_unlock_achievement da migração de XP).
-- ================================================================


-- ── 1. Loadout (Principal + Equipe) e placar ────────────────────
create table if not exists wild_loadout (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  principal_id uuid references wild_backpack(id) on delete set null,
  team_ids     uuid[] not null default '{}',
  wins         int not null default 0,
  losses       int not null default 0,
  updated_at   timestamptz not null default now()
);

alter table wild_loadout enable row level security;

-- Só SELECT direto do client (pra saber o próprio placar/loadout atual).
-- Escrita só pela RPC set_wild_loadout — ela é quem valida que os IDs
-- realmente pertencem à mochila do usuário; wins/losses só mudam dentro
-- de battle_random_opponent (nunca escrita direta, senão dava pra forjar
-- vitória no console).
drop policy if exists "wild_loadout_select_own" on wild_loadout;
create policy "wild_loadout_select_own" on wild_loadout
  for select using (user_id = auth.uid());


-- ── 2. set_wild_loadout — define Principal + Equipe ─────────────
create or replace function set_wild_loadout(p_principal_id uuid, p_team_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_ids uuid[];
  v_len      int;
  v_count    int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;

  if p_principal_id is not null and not exists (
    select 1 from wild_backpack where id = p_principal_id and user_id = auth.uid()
  ) then
    raise exception 'Esse Pokémon não está na sua mochila.';
  end if;

  -- Aceita times PARCIAIS (0 a 3) — o app adiciona 1 de cada vez ao
  -- clicar em "🛡️ Equipe" (0→1→2→3), então exigir exatamente 3 aqui
  -- travaria a 1ª e a 2ª adição. Quem exige os 3 completos pra valer é
  -- só a hora de batalhar (battle_random_opponent).
  v_team_ids := coalesce(p_team_ids, '{}');
  v_len := coalesce(array_length(v_team_ids, 1), 0);

  if v_len > 3 then
    raise exception 'A equipe pode ter no máximo 3 Pokémon.';
  end if;

  if v_len > 0 then
    if (select count(distinct x) from unnest(v_team_ids) x) <> v_len then
      raise exception 'A equipe não pode ter o mesmo Pokémon repetido.';
    end if;
    select count(*) into v_count from wild_backpack where id = any(v_team_ids) and user_id = auth.uid();
    if v_count <> v_len then
      raise exception 'Algum Pokémon da equipe não está na sua mochila.';
    end if;
  end if;

  insert into wild_loadout (user_id, principal_id, team_ids, updated_at)
  values (auth.uid(), p_principal_id, v_team_ids, now())
  on conflict (user_id) do update
    set principal_id = excluded.principal_id,
        team_ids     = excluded.team_ids,
        updated_at   = now();

  return jsonb_build_object('ok', true, 'principal_id', p_principal_id, 'team_ids', v_team_ids);
end;
$$;
grant execute on function set_wild_loadout(uuid, uuid[]) to authenticated;


-- ── 3. release_wild_pokemon — agora também limpa o loadout ──────
-- (principal_id já zera sozinho via ON DELETE SET NULL da FK acima;
-- team_ids é array, não tem FK nativa, então precisa tirar na mão.)
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

  update wild_loadout
  set team_ids = array_remove(team_ids, p_backpack_id), updated_at = now()
  where user_id = auth.uid() and p_backpack_id = any(team_ids);

  delete from wild_backpack where id = p_backpack_id and user_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;
grant execute on function release_wild_pokemon(uuid) to authenticated;


-- ── 4. Catálogo de conquistas novas ──────────────────────────────
insert into achievements (code, title, description, icon, category, xp_bonus) values
  ('wild_battle_first_win', 'Primeira Vitória',  'Vença sua primeira batalha contra outro treinador.', '⚔️', 'wild_battle', 30),
  ('wild_battle_win_10',    'Veterano de Arena',  'Vença 10 batalhas contra outros treinadores.',       '🛡️', 'wild_battle', 150)
on conflict (code) do nothing;


-- ── 5. wp_battle_duel — resolve 1 duelo (interno, não é RPC) ────
-- Recebe 2 Pokémon (jsonb com hp/atk/def/spd/crit) e devolve o vencedor
-- + o replay rodada a rodada. HP vira uma "barra de vida" (stat×3) pra
-- o combate durar alguns golpes em vez de acabar num hit só. Quem tem
-- mais Agilidade ataca primeiro (empate = sorteio); dano = Ataque − meia
-- Defesa do oponente (mínimo 1); chance de crítico = Crítico/250 (crit
-- 100 ≈ 40% de chance, nunca garantido) com dano ×1.5.
create or replace function wp_battle_duel(p_a jsonb, p_b jsonb)
returns jsonb
language plpgsql
as $$
declare
  a_hp   numeric := (p_a->>'hp')::numeric * 3;
  b_hp   numeric := (p_b->>'hp')::numeric * 3;
  a_atk  numeric := (p_a->>'atk')::numeric;
  b_atk  numeric := (p_b->>'atk')::numeric;
  a_def  numeric := (p_a->>'def')::numeric;
  b_def  numeric := (p_b->>'def')::numeric;
  a_spd  numeric := (p_a->>'spd')::numeric;
  b_spd  numeric := (p_b->>'spd')::numeric;
  a_crit numeric := (p_a->>'crit')::numeric;
  b_crit numeric := (p_b->>'crit')::numeric;
  first_is_a boolean;
  v_log  jsonb := '[]'::jsonb;
  dmg    numeric;
  is_crit boolean;
  v_round int := 0;
  winner text;
begin
  first_is_a := (a_spd > b_spd) or (a_spd = b_spd and random() < 0.5);

  loop
    v_round := v_round + 1;

    if first_is_a then
      is_crit := random() < (a_crit / 250.0);
      dmg := greatest(1, round(a_atk - b_def * 0.5));
      if is_crit then dmg := round(dmg * 1.5); end if;
      b_hp := b_hp - dmg;
      v_log := v_log || jsonb_build_object('side', 'a', 'dmg', dmg, 'crit', is_crit, 'hp_b', greatest(b_hp, 0));
      if b_hp <= 0 then winner := 'a'; exit; end if;

      is_crit := random() < (b_crit / 250.0);
      dmg := greatest(1, round(b_atk - a_def * 0.5));
      if is_crit then dmg := round(dmg * 1.5); end if;
      a_hp := a_hp - dmg;
      v_log := v_log || jsonb_build_object('side', 'b', 'dmg', dmg, 'crit', is_crit, 'hp_a', greatest(a_hp, 0));
      if a_hp <= 0 then winner := 'b'; exit; end if;
    else
      is_crit := random() < (b_crit / 250.0);
      dmg := greatest(1, round(b_atk - a_def * 0.5));
      if is_crit then dmg := round(dmg * 1.5); end if;
      a_hp := a_hp - dmg;
      v_log := v_log || jsonb_build_object('side', 'b', 'dmg', dmg, 'crit', is_crit, 'hp_a', greatest(a_hp, 0));
      if a_hp <= 0 then winner := 'b'; exit; end if;

      is_crit := random() < (a_crit / 250.0);
      dmg := greatest(1, round(a_atk - b_def * 0.5));
      if is_crit then dmg := round(dmg * 1.5); end if;
      b_hp := b_hp - dmg;
      v_log := v_log || jsonb_build_object('side', 'a', 'dmg', dmg, 'crit', is_crit, 'hp_b', greatest(b_hp, 0));
      if b_hp <= 0 then winner := 'a'; exit; end if;
    end if;

    if v_round >= 30 then -- salvaguarda — na prática nunca deve chegar aqui
      winner := case when a_hp >= b_hp then 'a' else 'b' end;
      exit;
    end if;
  end loop;

  return jsonb_build_object('winner', winner, 'log', v_log, 'rounds', v_round);
end;
$$;
revoke execute on function wp_battle_duel(jsonb, jsonb) from public;


-- ── 6. battle_random_opponent — sorteia rival + formato e resolve ──
create or replace function battle_random_opponent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       wild_loadout%rowtype;
  v_opp      wild_loadout%rowtype;
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
    perform xp_award(auth.uid(), 'wild_battle', gen_random_uuid()::text, 25);
    perform xp_unlock_achievement(auth.uid(), 'wild_battle_first_win');
    if v_me_wins = 10 then perform xp_unlock_achievement(auth.uid(), 'wild_battle_win_10'); end if;
  else
    update wild_loadout set losses = losses + 1, updated_at = now() where user_id = auth.uid();
    update wild_loadout set wins = wins + 1, updated_at = now() where user_id = v_opp.user_id;
    perform xp_award(auth.uid(), 'wild_battle', gen_random_uuid()::text, 10);
  end if;

  return jsonb_build_object(
    'format',  v_format,
    'overall', v_overall, -- 'a' = eu venci, 'b' = o rival venceu
    'duels',   v_duels,
    'my_record', (select jsonb_build_object('wins', wins, 'losses', losses) from wild_loadout where user_id = auth.uid())
  );
end;
$$;
grant execute on function battle_random_opponent() to authenticated;
