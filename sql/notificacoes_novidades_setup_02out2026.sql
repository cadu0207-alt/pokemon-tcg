-- ================================================================
-- MyDeck — NOTIFICAÇÕES, ETAPA 4: NOVIDADES E NOTÍCIAS (02/10/2026)
-- Toda linha nova em `site_updates` (Novidades do MyDeck / changelog) e em
-- `pokemon_news` (Notícias do Mundo Pokémon) vira uma notificação para cada
-- usuário — no sino e, pra quem ativou, push. AUTOMÁTICO: publicar pelo
-- changelog/*.md (GitHub Action), pelo formulário do admin ou direto no
-- banco dispara do mesmo jeito, porque o gatilho está na tabela.
--
-- • E-mail NÃO é enviado pra esses tipos (a Edge Function só manda e-mail
--   de tipos de leilão — ver EMAIL_TYPES em dispatch.ts).
-- • Cada usuário pode desligar em notification_prefs.news_enabled (padrão
--   ligado; a linha "Novidades do MyDeck" do painel do sino). Desligado =
--   nem sino nem push desse tipo.
-- • Erro no gatilho NUNCA bloqueia a publicação (exception → warning).
--
-- Depende das etapas 1-3 (notifications, notification_prefs, trg_notify_dispatch).
-- Idempotente.
-- ================================================================

-- ── 1. PREFERÊNCIA ─────────────────────────────────────────────────
alter table notification_prefs
  add column if not exists news_enabled boolean not null default true;
-- INSERT já é table-level (etapa 3); falta liberar o UPDATE da coluna nova
grant update (news_enabled) on notification_prefs to authenticated;

-- ── 2. GATILHO: NOVIDADE DO SITE (site_updates) ────────────────────
create or replace function notify_site_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into notifications (user_id, type, title, body, data)
    select u.id, 'site_update', new.title,
           case when length(new.message) > 160 then left(new.message, 157) || '…' else new.message end,
           jsonb_build_object('update_id', new.id, 'url', '/')
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true);
  exception when others then
    raise warning 'notify_site_update: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_site_update() from public, anon, authenticated;

drop trigger if exists trg_notify_site_update on site_updates;
create trigger trg_notify_site_update
  after insert on site_updates
  for each row execute function notify_site_update();

-- ── 3. GATILHO: NOTÍCIA (pokemon_news) ─────────────────────────────
create or replace function notify_pokemon_news()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := coalesce(nullif(btrim(new.subtitle), ''), new.body, '');
begin
  begin
    insert into notifications (user_id, type, title, body, data)
    select u.id, 'news', '📰 ' || new.title,
           case when length(v_body) > 160 then left(v_body, 157) || '…' else v_body end,
           jsonb_build_object('news_id', new.id, 'url', '/')
      from auth.users u
      left join notification_prefs p on p.user_id = u.id
     where coalesce(p.news_enabled, true);
  exception when others then
    raise warning 'notify_pokemon_news: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function notify_pokemon_news() from public, anon, authenticated;

drop trigger if exists trg_notify_pokemon_news on pokemon_news;
create trigger trg_notify_pokemon_news
  after insert on pokemon_news
  for each row execute function notify_pokemon_news();
