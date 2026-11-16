-- ================================================================
-- wild_ranking_setup.sql — Ranking de batalhas + nome público (MyDeck)
-- ================================================================
-- Adiciona:
--   1. `display_name` em wild_loadout — nome livre que o jogador escolhe
--      pra aparecer no ranking (em vez do e-mail/UID). Validado (tamanho +
--      caracteres) e filtrado contra uma lista de termos ofensivos.
--   2. `wild_battle_log` — 1 linha por batalha (vencedor/perdedor/formato/
--      data), alimentada dentro de battle_random_opponent. É o que permite
--      calcular ranking por dia/semana/mês/total sem precisar manter
--      contador separado pra cada período (a query agrega na hora).
--   3. `wild_ranking(periodo)` — RPC pública (security definer) que
--      devolve só nome + vitórias, nunca e-mail/UID de ninguém.
--
-- Rodar depois de wild_battle_setup.sql + wild_battle_fix_loadout.sql.
-- ================================================================


-- ── 1. Nome público (display_name) ───────────────────────────────
alter table wild_loadout add column if not exists display_name text;

-- Lista de termos bloqueados — checagem por "contém", case-insensitive.
-- É um filtro simples (substring), não é infalível (não pega variações
-- tipo "p0rra" ou espaçado) — serve como primeira barreira. Eduardo pode
-- adicionar mais termos rodando "insert into wild_banned_words (word)
-- values ('termo') on conflict do nothing;" a qualquer momento, sem
-- precisar mexer em função nenhuma.
create table if not exists wild_banned_words (
  word text primary key
);
insert into wild_banned_words (word) values
  ('porra'), ('caralho'), ('buceta'), ('piroca'), ('viado'), ('bicha'),
  ('puta'), ('arrombad'), ('corno'), ('macaco'), ('preto fdp'),
  ('fdp'), ('desgraça'), ('cuzao'), ('cuzão'), ('otario'), ('otário'),
  ('retardad'), ('nigger'), ('nigga'), ('fuck'), ('shit'), ('bitch'),
  ('cunt'), ('rape'), ('hitler'), ('nazi'), ('slut'), ('whore')
on conflict do nothing;

create or replace function set_display_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text;
  v_lower text;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;

  v_clean := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_clean) < 3 or length(v_clean) > 18 then
    raise exception 'O nome precisa ter entre 3 e 18 caracteres.';
  end if;
  if v_clean !~ '^[[:alnum:][:space:]._-]+$' then
    raise exception 'Use só letras, números, espaço, ponto, traço ou underline.';
  end if;

  v_lower := lower(v_clean);
  if exists (select 1 from wild_banned_words w where v_lower like '%' || w.word || '%') then
    raise exception 'Esse nome não é permitido — escolha outro.';
  end if;

  insert into wild_loadout (user_id, display_name, updated_at)
  values (auth.uid(), v_clean, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name, updated_at = now();

  return jsonb_build_object('ok', true, 'display_name', v_clean);
end;
$$;
grant execute on function set_display_name(text) to authenticated;


-- ── 2. Log de batalhas (base do ranking) ─────────────────────────
create table if not exists wild_battle_log (
  id         uuid primary key default gen_random_uuid(),
  winner_id  uuid not null references auth.users(id) on delete cascade,
  loser_id   uuid not null references auth.users(id) on delete cascade,
  format     text not null,
  created_at timestamptz not null default now()
);
alter table wild_battle_log enable row level security;
-- De propósito SEM nenhuma policy — ninguém lê essa tabela direto, nem a
-- própria linha. O único jeito de ver dado agregado dela é pela RPC
-- wild_ranking abaixo, que nunca devolve winner_id/loser_id, só nome+contagem.

create index if not exists wild_battle_log_winner_time_idx on wild_battle_log (winner_id, created_at desc);

-- battle_random_opponent — mesma função de wild_battle_setup.sql, só
-- adicionando 1 insert no log logo depois de decidir v_overall (todo o
-- resto do corpo é idêntico).
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
grant execute on function battle_random_opponent() to authenticated;


-- ── 3. wild_ranking — top 20 por período (só nome + vitórias) ────
create or replace function wild_ranking(p_period text)
returns table(display_name text, wins bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  if p_period = 'day' then v_since := date_trunc('day', now());
  elsif p_period = 'week' then v_since := date_trunc('week', now());
  elsif p_period = 'month' then v_since := date_trunc('month', now());
  elsif p_period = 'all' then v_since := '-infinity'::timestamptz;
  else raise exception 'Período inválido: %', p_period;
  end if;

  return query
  select coalesce(l.display_name, 'Treinador Anônimo') as display_name, count(*)::bigint as wins
  from wild_battle_log b
  join wild_loadout l on l.user_id = b.winner_id
  where b.created_at >= v_since
  group by b.winner_id, l.display_name
  order by wins desc, display_name asc
  limit 20;
end;
$$;
-- Ranking é público mesmo sem login (a aba Início não exige login — ver
-- cabeçalho de inicio.js), por isso libera pra anon também, não só authenticated.
grant execute on function wild_ranking(text) to anon, authenticated;
