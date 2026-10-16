-- ================================================================
-- MyDeck — Minigame Pokémon Escondidos: EVENTOS DE APARIÇÃO (pacote D, 17/10/2026)
-- ================================================================
-- O admin (Eduardo) agenda uma janela (ex.: hoje 15h–16h) em que um grupo de Pokémon aparece muito mais:
--   • kind='rarity'  → todos os Pokémon RAROS ou todos os ULTRA-RAROS;
--   • kind='species' → UMA espécie específica (ex.: Mewtwo).
-- Dentro da janela, boost_pct % das aparições (padrão 40%) saem do grupo do evento; o resto segue o sorteio normal.
-- O cliente encurta o intervalo entre aparições durante o evento (~90 s) → ~16 Pokémon de evento por hora.
-- Avisos: sino (+ push) quando o evento COMEÇA (tipo 'wild_event', passa pela fila de pushes em massa) e um aviso
-- só no sino quando é AGENDADO (tipo 'wild_event_info', fora do push). O cron wild-event-tick roda a cada minuto.
-- Tudo passa por funções (tabela fechada); só o administrador agenda/cancela.
-- ================================================================

create table if not exists public.wild_events (
  id                  bigint generated always as identity primary key,
  kind                text not null check (kind in ('rarity', 'species')),
  rarity              text check (rarity in ('rara', 'ultra_rara')),
  slug                text references public.wild_species(slug),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  boost_pct           int  not null default 40 check (boost_pct between 5 and 100),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  announced_at        timestamptz,
  started_notified_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '6 hours'),
  check ((kind = 'rarity' and rarity is not null and slug is null) or (kind = 'species' and slug is not null and rarity is null))
);
create index if not exists wild_events_window_idx on public.wild_events (starts_at, ends_at) where cancelled_at is null;
alter table public.wild_events enable row level security;
revoke all on public.wild_events from anon, authenticated;

-- ── helpers ────────────────────────────────────────────────────────
create or replace function public.wild_is_admin()
returns boolean language sql stable set search_path = public
as $$ select auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'::uuid $$;
revoke all on function public.wild_is_admin() from public, anon, authenticated;

create or replace function public.wild_event_label(e public.wild_events)
returns text language sql stable set search_path = public
as $$
  select case e.kind
    when 'rarity' then case e.rarity when 'rara' then 'Aparição de Pokémon Raro' else 'Aparição de Pokémon Ultra-Raro' end
    else 'Aparição especial: ' || coalesce((select s.name from public.wild_species s where s.slug = e.slug), e.slug)
  end
$$;
revoke all on function public.wild_event_label(public.wild_events) from public, anon, authenticated;

create or replace function public.wild_event_json(e public.wild_events)
returns jsonb language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'rarity', e.rarity, 'slug', e.slug,
    'dex',  (select s.dex  from public.wild_species s where s.slug = e.slug),
    'name', (select s.name from public.wild_species s where s.slug = e.slug),
    'title', public.wild_event_label(e),
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'boost_pct', e.boost_pct)
$$;
revoke all on function public.wild_event_json(public.wild_events) from public, anon, authenticated;

create or replace function public.wild_event_hhmm(p_ts timestamptz)
returns text language sql stable set search_path = public
as $$
  select to_char(p_ts at time zone 'America/Sao_Paulo', 'HH24') || 'h'
         || case when extract(minute from p_ts at time zone 'America/Sao_Paulo') = 0 then '' else to_char(p_ts at time zone 'America/Sao_Paulo', 'MI') end
$$;
revoke all on function public.wild_event_hhmm(timestamptz) from public, anon, authenticated;

-- ── push: 'wild_event' entra na fila de pushes em massa; 'wild_event_info' fica só no sino ────────
create or replace function public.push_broadcast_types()
returns text[] language sql immutable set search_path = public
as $$ select array['site_update', 'news', 'new_auction', 'new_raffle', 'wild_event']::text[] $$;

create or replace function public.push_silent_types()
returns text[] language sql immutable set search_path = public
as $$ select array['wild_event_info']::text[] $$;

create or replace function public.notify_dispatch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_ids    bigint[];
begin
  begin
    select value into v_secret from app_private_config where key = 'notify_secret';
    select array_agg(id) into v_ids from new_rows
     where type <> all (push_broadcast_types()) and type <> all (push_silent_types());

    if v_secret is not null and v_ids is not null then
      perform net.http_post(
        url     := 'https://dvkiodmhtzlkvmyyzelx.supabase.co/functions/v1/notify-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body    := jsonb_build_object('ids', to_jsonb(v_ids))
      );
    end if;
  exception when others then
    raise warning 'notify_dispatch falhou (ignorado, a notificação foi gravada): %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.push_silent_types() from public, anon, authenticated;

-- ── avisos ─────────────────────────────────────────────────────────
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
     where coalesce(p.news_enabled, true);
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
     where coalesce(p.news_enabled, true);
  end if;
exception when others then
  raise warning 'wild_event_notify: %', sqlerrm;
end;
$$;
revoke all on function public.wild_event_notify(bigint, text) from public, anon, authenticated;

create or replace function public.wild_event_tick()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.wild_events
            where cancelled_at is null and started_notified_at is null and starts_at <= now() and ends_at > now()
            order by starts_at
  loop
    update public.wild_events set started_notified_at = now() where id = r.id and started_notified_at is null;
    if found then perform public.wild_event_notify(r.id, 'start'); n := n + 1; end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.wild_event_tick() from public, anon, authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────
create or replace function public.wild_event_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare a jsonb; n jsonb;
begin
  select public.wild_event_json(e) into a from public.wild_events e
   where e.cancelled_at is null and e.starts_at <= now() and e.ends_at > now() order by e.starts_at limit 1;
  select public.wild_event_json(e) into n from public.wild_events e
   where e.cancelled_at is null and e.starts_at > now() and e.starts_at < now() + interval '7 days' order by e.starts_at limit 1;
  return jsonb_build_object('now', now(), 'active', a, 'next', n);
end;
$$;

create or replace function public.wild_event_create(
  p_kind text, p_rarity text, p_slug text, p_starts_at timestamptz,
  p_minutes int default 60, p_boost int default 40)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e     public.wild_events;
  v_end timestamptz;
begin
  if not public.wild_is_admin() then raise exception 'Só o administrador agenda eventos.'; end if;
  if p_kind not in ('rarity', 'species') then raise exception 'Tipo de evento inválido.'; end if;
  if p_kind = 'rarity' and (p_rarity is null or p_rarity not in ('rara', 'ultra_rara')) then raise exception 'Escolha raro ou ultra-raro.'; end if;
  if p_kind = 'species' and not exists (select 1 from public.wild_species where slug = p_slug) then raise exception 'Pokémon inválido.'; end if;
  if p_minutes is null or p_minutes not between 10 and 360 then raise exception 'A duração precisa ficar entre 10 minutos e 6 horas.'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '2 minutes' then raise exception 'O início precisa ser agora ou no futuro.'; end if;
  if p_boost is null or p_boost not between 5 and 100 then raise exception 'Intensidade inválida.'; end if;
  v_end := p_starts_at + make_interval(mins => p_minutes);
  if exists (select 1 from public.wild_events w where w.cancelled_at is null and w.starts_at < v_end and w.ends_at > p_starts_at) then
    raise exception 'Já existe um evento nesse horário.';
  end if;

  insert into public.wild_events (kind, rarity, slug, starts_at, ends_at, boost_pct, created_by)
  values (p_kind, case when p_kind = 'rarity' then p_rarity end, case when p_kind = 'species' then p_slug end,
          p_starts_at, v_end, p_boost, auth.uid())
  returning * into e;

  if e.starts_at > now() + interval '2 minutes' then perform public.wild_event_notify(e.id, 'soon'); end if;
  perform public.wild_event_tick();
  return public.wild_event_json(e);
end;
$$;

create or replace function public.wild_event_cancel(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wild_is_admin() then raise exception 'Só o administrador cancela eventos.'; end if;
  update public.wild_events set cancelled_at = now() where id = p_id and cancelled_at is null;
  if not found then return false; end if;
  delete from public.notifications where read_at is null and data ->> 'event_id' = p_id::text and type in ('wild_event', 'wild_event_info');
  update public.push_broadcast_queue set status = 'expired' where batch like 'wild_event:' || p_id || ':%' and status = 'pending';
  return true;
end;
$$;

create or replace function public.wild_event_list_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.wild_is_admin() then raise exception 'Só o administrador.'; end if;
  return coalesce((select jsonb_agg(public.wild_event_json(e) order by e.starts_at)
                   from public.wild_events e where e.cancelled_at is null and e.ends_at > now() - interval '1 day'), '[]'::jsonb);
end;
$$;

-- ── sorteio: dentro da janela, parte das aparições vem do grupo do evento ──────────────────
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

  return jsonb_build_object('ok', true, 'spawn_id', v_id, 'slug', v_slug, 'dex', v_dex, 'event_id', v_event);
end;
$$;

-- ── permissões ─────────────────────────────────────────────────────
revoke all on function public.wild_event_status()  from public;
revoke all on function public.wild_event_create(text, text, text, timestamptz, int, int) from public, anon;
revoke all on function public.wild_event_cancel(bigint) from public, anon;
revoke all on function public.wild_event_list_admin() from public, anon;
revoke all on function public.wild_spawn() from public, anon;
grant execute on function public.wild_event_status() to anon, authenticated;
grant execute on function public.wild_event_create(text, text, text, timestamptz, int, int) to authenticated;
grant execute on function public.wild_event_cancel(bigint) to authenticated;
grant execute on function public.wild_event_list_admin() to authenticated;
grant execute on function public.wild_spawn() to authenticated;

-- ── cron: avisa quando o evento começa (a cada minuto) ───────────────
select cron.unschedule(jobid) from cron.job where jobname = 'wild-event-tick';
select cron.schedule('wild-event-tick', '* * * * *', 'select public.wild_event_tick()');
