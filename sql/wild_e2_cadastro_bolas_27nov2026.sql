-- ================================================================
-- MyDeck — Minigame "Pokémon Escondidos": E2 (cadastro, bolas e avisos) — 27/11/2026
-- ================================================================
-- Depende dos pacotes B, C e D (17/10/2026) já aplicados.
--
--   1) CAPTURAS DO VISITANTE: wild_import_guest leva para uma conta nova (até 7 dias, sem capturas, uma única
--      vez) até 10 Pokémon COMUNS pegos sem login. Sem XP e sem mochila. O navegador pode ser editado, por
--      isso o limite é pequeno.
--   2) BOLAS ONDE FALTA: marcos novos (25, 75, 100 e 125 espécies) e recompensa em marcos que já existiam
--      (10 e 50 espécies, 1ª ultra-rara, 1ª vitória). Quem já tinha essas quatro conquistas recebe UMA vez
--      agora. Kit de 2 Great Balls na primeira aparição de cada evento.
--   3) AVISOS SÓ PARA QUEM JOGA: o aviso de evento vai para quem capturou nos últimos 90 dias e está com
--      "Novidades" e "Avisos do minigame" ligados.
--   4) BOTÕES DO SINO: libera a gravação das preferências de aviso (vale para todos os botões, não só o novo).
--
-- Ordem: 1) este SQL  2) publicar wild_pokemon.js e notificacoes.js. Com o site antigo no ar nada quebra.
-- Pode rodar de novo: o pagamento a quem já tinha as conquistas acontece só na primeira vez. Se aparecer
-- "deadlock detected" (alguém jogando no mesmo instante), nada foi gravado: rode outra vez.
--
-- Para desfazer: reaplicar catch_wild_pokemon (pacote C) e wild_spawn / wild_event_notify (pacote D), ou as
-- definições salvas antes de rodar. Colunas e tabelas novas podem ficar. Para parar as recompensas novas:
--   delete from public.wild_ball_rewards where code in ('wild_catch_10','wild_catch_25','wild_catch_50',
--     'wild_catch_75','wild_catch_100','wild_catch_125','wild_first_ultra','wild_battle_first_win');
-- ================================================================

begin;

do $$
begin
  if to_regclass('public.wild_events') is null or to_regclass('public.wild_ball_rewards') is null
     or to_regclass('public.wild_spawns') is null or to_regprocedure('public.wild_init_balls()') is null then
    raise exception 'E2: aplique antes os pacotes B, C e D do minigame (17/10/2026).';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notification_prefs' and column_name = 'news_enabled') then
    raise exception 'E2: falta notification_prefs.news_enabled (notificacoes_novidades_setup_02out2026.sql).';
  end if;
end $$;

-- ── 1) Estruturas novas ─────────────────────────────────────────────────────
alter table public.wild_balls add column if not exists guest_imported_at timestamptz;

-- segura conquistas novas até o fim: sem isso, uma liberada durante a migração poderia ficar sem a bola. Vem depois
-- de wild_balls para travar na mesma ordem de uma captura em andamento.
lock table public.user_achievements in share row exclusive mode;

alter table public.notification_prefs add column if not exists minigame_enabled boolean not null default true;
grant update (minigame_enabled) on public.notification_prefs to authenticated;
-- botões do sino: o navegador grava a preferência regravando também o user_id, e sem esta permissão o banco recusa.
-- A política de linha continua prendendo cada conta à própria linha. Se a permissão já existir, nada muda.
grant update (user_id) on public.notification_prefs to authenticated;

-- livro-caixa das bolas entregues fora das conquistas novas (pagamento retroativo e kit de evento)
create table if not exists public.wild_ball_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('retro', 'event')),
  ref        text not null,
  tier       text not null check (tier in ('pokeball','greatball','ultraball','masterball')),
  qty        int  not null check (qty between 1 and 50),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.wild_ball_grants enable row level security;
revoke all on public.wild_ball_grants from anon, authenticated;

-- ── 2) Marcos novos e recompensas ───────────────────────────────────────────
insert into public.achievements (code, title, description, icon, category, xp_bonus) values
  ('wild_catch_25',  'Rastreador',          'Capture 25 espécies diferentes.',  '🔦', 'wild_catch', 70),
  ('wild_catch_75',  'Explorador de Kanto', 'Capture 75 espécies diferentes.',  '🗺️', 'wild_catch', 160),
  ('wild_catch_100', 'Centena de Kanto',    'Capture 100 espécies diferentes.', '💯', 'wild_catch', 220),
  ('wild_catch_125', 'Quase Mestre',        'Capture 125 espécies diferentes.', '🎓', 'wild_catch', 300)
on conflict (code) do nothing;

-- quem vai receber o retroativo precisa ter a linha de saldo
insert into public.wild_balls (user_id)
select distinct u.user_id from public.user_achievements u
 where u.achievement_code in ('wild_catch_10', 'wild_catch_50', 'wild_first_ultra', 'wild_battle_first_win')
on conflict (user_id) do nothing;

-- Cria as recompensas e paga quem já tinha a conquista. O pagamento acontece UMA única vez: depois que a marca
-- 'wild_e2_retro' é gravada (logo abaixo), rodar de novo só recria as linhas que faltarem. Recompensa que já
-- existia antes (ajuste feito por você) também não é paga.
with novas as (
  insert into public.wild_ball_rewards (code, tier, qty)
  select v.code, v.tier, v.qty
  from (values
    ('wild_catch_10', 'greatball', 2), ('wild_catch_25', 'ultraball', 1), ('wild_catch_50', 'ultraball', 2),
    ('wild_catch_75', 'ultraball', 2), ('wild_catch_100', 'ultraball', 2), ('wild_catch_125', 'ultraball', 2),
    ('wild_first_ultra', 'ultraball', 1), ('wild_battle_first_win', 'greatball', 1)
  ) as v(code, tier, qty)
  join public.achievements a on a.code = v.code
  on conflict (code) do nothing
  returning code, tier, qty
), registro as (
  insert into public.wild_ball_grants (user_id, kind, ref, tier, qty)
  select u.user_id, 'retro', n.code, n.tier, n.qty
  from public.user_achievements u join novas n on n.code = u.achievement_code
  where not exists (select 1 from public.app_private_config c where c.key = 'wild_e2_retro')
  on conflict (user_id, kind, ref) do nothing
  returning user_id, tier, qty
), soma as (
  select user_id,
    coalesce(sum(qty) filter (where tier = 'pokeball'),   0)::int as p,
    coalesce(sum(qty) filter (where tier = 'greatball'),  0)::int as g,
    coalesce(sum(qty) filter (where tier = 'ultraball'),  0)::int as u,
    coalesce(sum(qty) filter (where tier = 'masterball'), 0)::int as m
  from registro group by user_id
)
update public.wild_balls b set
  pokeball = b.pokeball + s.p, greatball = b.greatball + s.g, ultraball = b.ultraball + s.u, masterball = b.masterball + s.m,
  updated_at = now()
from soma s where b.user_id = s.user_id;

insert into public.app_private_config (key, value) values ('wild_e2_retro', now()::text)
on conflict (key) do nothing;

-- ── 3) Capturas do visitante ────────────────────────────────────────────────
create or replace function public.wild_import_guest(p_slugs text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max     constant int      := 10;                  -- espécies comuns levadas
  c_max_age constant interval := interval '7 days';   -- idade máxima da conta
  v_balls   public.wild_balls;
  v_created timestamptz;
  v_n       int;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  if coalesce(array_length(p_slugs, 1), 0) > 151 then raise exception 'Lista inválida.'; end if;

  perform public.wild_init_balls();
  -- trava a linha da conta: duas abas ao mesmo tempo não importam duas vezes
  select * into v_balls from public.wild_balls where user_id = auth.uid() for update;
  if v_balls.guest_imported_at is not null then return jsonb_build_object('ok', false, 'reason', 'ja_importou'); end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - c_max_age then return jsonb_build_object('ok', false, 'reason', 'conta_antiga'); end if;
  if exists (select 1 from public.wild_catches where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'ja_tem_capturas');
  end if;

  insert into public.wild_catches (user_id, pokemon_slug, dex, rarity, count, first_caught_at, last_caught_at)
  select auth.uid(), t.slug, t.dex, t.rarity, 1, now(), now()
  from (
    select s.slug, s.dex, s.rarity
    from unnest(coalesce(p_slugs, '{}'::text[])) with ordinality as x(slug, ord)
    join public.wild_species s on s.slug = x.slug and s.rarity = 'comum'
    group by s.slug, s.dex, s.rarity
    order by min(x.ord)
    limit c_max
  ) t;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.wild_balls set guest_imported_at = now(), updated_at = now() where user_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'imported', v_n);
end;
$$;
revoke all on function public.wild_import_guest(text[]) from public, anon;
grant execute on function public.wild_import_guest(text[]) to authenticated;

-- ── 4) Captura: marcos com ">=" (base: pacote C) ────────────────────────────
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
    -- 27/11/2026: ">=" e não "=" (capturas trazidas do visitante pulam a contagem exata, e marcos novos precisam
    -- alcançar quem já passou deles). xp_unlock_achievement não faz nada se a conquista já foi liberada.
    if v_distinct_count >= 1   then perform xp_unlock_achievement(auth.uid(), 'wild_first_catch'); end if;
    if v_distinct_count >= 10  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_10');    end if;
    if v_distinct_count >= 25  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_25');    end if;
    if v_distinct_count >= 50  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_50');    end if;
    if v_distinct_count >= 75  then perform xp_unlock_achievement(auth.uid(), 'wild_catch_75');    end if;
    if v_distinct_count >= 100 then perform xp_unlock_achievement(auth.uid(), 'wild_catch_100');   end if;
    if v_distinct_count >= 125 then perform xp_unlock_achievement(auth.uid(), 'wild_catch_125');   end if;
    if v_distinct_count >= 151 then perform xp_unlock_achievement(auth.uid(), 'wild_catch_150');   end if;

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
revoke all on function public.catch_wild_pokemon(text, smallint, text, text, uuid, uuid) from public, anon;
grant execute on function public.catch_wild_pokemon(text, smallint, text, text, uuid, uuid) to authenticated;

-- ── 5) Aparição: kit do evento (base: pacote D) ─────────────────────────────
create or replace function public.wild_spawn()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_max constant int      := 450;
  c_min_gap   constant interval := interval '20 seconds';
  c_ttl       constant interval := interval '60 seconds';
  v_day   public.wild_daily;
  v_ev    public.wild_events;
  v_slug  text;
  v_dex   smallint;
  v_id    uuid;
  v_event bigint;
  v_rows  int;
  v_balls public.wild_balls;
  v_gift  jsonb;
begin
  if auth.uid() is null then raise exception 'Você precisa estar logado.'; end if;
  v_day := public.wild_daily_touch(auth.uid());
  if v_day.spawns >= c_daily_max then return jsonb_build_object('ok', false, 'reason', 'teto_diario'); end if;
  if v_day.last_spawn_at is not null and now() - v_day.last_spawn_at < c_min_gap then
    return jsonb_build_object('ok', false, 'reason', 'muito_cedo');
  end if;

  select * into v_ev from public.wild_events w
   where w.cancelled_at is null and w.starts_at <= now() and w.ends_at > now()
   order by w.starts_at limit 1;
  if v_ev.id is not null and random() < v_ev.boost_pct / 100.0 then
    if v_ev.kind = 'species' then
      select s.slug, s.dex into v_slug, v_dex from public.wild_species s where s.slug = v_ev.slug;
    else
      select s.slug, s.dex into v_slug, v_dex from public.wild_species s where s.rarity = v_ev.rarity order by random() limit 1;
    end if;
    if v_slug is not null then v_event := v_ev.id; end if;
  end if;

  if v_slug is null then
    select s.slug, s.dex into v_slug, v_dex
    from public.wild_species s
    order by -ln(1 - random()) / (case s.rarity when 'comum' then 240 when 'rara' then 86 when 'especial' then 34 else 24 end)
    limit 1;
  end if;

  delete from public.wild_spawns where created_at < now() - interval '1 day';
  insert into public.wild_spawns (user_id, slug, expires_at) values (auth.uid(), v_slug, now() + c_ttl) returning id into v_id;
  update public.wild_daily set spawns = spawns + 1, last_spawn_at = now(), updated_at = now() where user_id = auth.uid();

  -- 27/11/2026: kit do evento, 2 Great Balls na primeira aparição de cada evento, uma vez por conta
  if v_ev.id is not null then
    insert into public.wild_ball_grants (user_id, kind, ref, tier, qty)
    values (auth.uid(), 'event', v_ev.id::text, 'greatball', 2)
    on conflict (user_id, kind, ref) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      perform public.wild_init_balls();
      update public.wild_balls set greatball = greatball + 2, updated_at = now()
       where user_id = auth.uid() returning * into v_balls;
      v_gift := jsonb_build_object('tier', 'greatball', 'qty', 2, 'balls',
        jsonb_build_object('pokeball', v_balls.pokeball, 'greatball', v_balls.greatball, 'ultraball', v_balls.ultraball, 'masterball', v_balls.masterball));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'spawn_id', v_id, 'slug', v_slug, 'dex', v_dex, 'event_id', v_event, 'event_gift', v_gift);
end;
$$;
revoke all on function public.wild_spawn() from public, anon;
grant execute on function public.wild_spawn() to authenticated;

-- ── 6) Aviso de evento só para quem joga (base: pacote D) ───────────────────
create or replace function public.wild_event_notify(p_event bigint, p_phase text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e        public.wild_events;
  v_batch  text;
  v_emoji  text;
  v_desc   text;
  v_day    text;
  v_title  text;
  v_body   text;
  v_rows   int;
  v_name   text;
begin
  select * into e from public.wild_events where id = p_event and cancelled_at is null;
  if not found then return; end if;

  select s.name into v_name from public.wild_species s where s.slug = e.slug;
  v_emoji := case when e.kind = 'species' then '🎯' when e.rarity = 'ultra_rara' then '🌟' else '⚡' end;
  v_desc  := case when e.kind = 'species' then v_name || ' vai aparecer bem mais no seu mini game.'
                  when e.rarity = 'ultra_rara' then 'Pokémon ultra-raros vão aparecer bem mais no seu mini game.'
                  else 'Pokémon raros vão aparecer bem mais no seu mini game.' end;

  if p_phase = 'start' then
    v_batch := 'wild_event:' || e.id || ':start';
    insert into public.push_broadcast_queue (batch, type, bucket) values (v_batch, 'wild_event', 'info') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return; end if;
    v_title := v_emoji || ' Começou: ' || public.wild_event_label(e) || '!';
    v_body  := 'Até ' || public.wild_event_hhmm(e.ends_at) || '. ' || v_desc || ' Abra o site e fique de olho nos cantos da tela!';
    insert into public.notifications (user_id, type, title, body, data)
    select u.id, 'wild_event', v_title, left(v_body, 200),
           jsonb_build_object('event_id', e.id, 'url', '/', 'batch', v_batch)
      from auth.users u
      left join public.notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true) and coalesce(p.minigame_enabled, true)
       and exists (select 1 from public.wild_catches c
                    where c.user_id = u.id and c.last_caught_at > now() - interval '90 days');
    perform public.release_broadcast_pushes();
  elsif p_phase = 'soon' then
    update public.wild_events set announced_at = now() where id = e.id and announced_at is null;
    if not found then return; end if;
    v_batch := 'wild_event:' || e.id || ':soon';
    v_day := case ((e.starts_at at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date)
               when 0 then 'Hoje' when 1 then 'Amanhã'
               else to_char(e.starts_at at time zone 'America/Sao_Paulo', 'DD/MM') end;
    v_title := v_emoji || ' ' || public.wild_event_label(e) || '!';
    v_body  := v_day || ', das ' || public.wild_event_hhmm(e.starts_at) || ' às ' || public.wild_event_hhmm(e.ends_at) || '. ' || v_desc || ' Fique com o site aberto!';
    insert into public.notifications (user_id, type, title, body, data)
    select u.id, 'wild_event_info', v_title, left(v_body, 200),
           jsonb_build_object('event_id', e.id, 'url', '/', 'batch', v_batch)
      from auth.users u
      left join public.notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true) and coalesce(p.minigame_enabled, true)
       and exists (select 1 from public.wild_catches c
                    where c.user_id = u.id and c.last_caught_at > now() - interval '90 days');
  end if;
exception when others then
  raise warning 'wild_event_notify: %', sqlerrm;
end;
$$;
revoke all on function public.wild_event_notify(bigint, text) from public, anon, authenticated;

commit;

-- Conferência (só leitura), depois de rodar:
--   select kind, ref, count(*) as contas, sum(qty) as bolas from public.wild_ball_grants group by 1, 2 order by 1, 2;
--   select code, tier, qty from public.wild_ball_rewards where code like 'wild%' order by 1;
--   select has_column_privilege('authenticated', 'public.notification_prefs', 'user_id', 'update');  -- true
