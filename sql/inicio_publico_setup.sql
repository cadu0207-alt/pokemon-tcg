-- ================================================================
-- MyDeck — ABA INÍCIO PÚBLICA (29/08/2026)
-- Rodar no SQL Editor do Supabase — seguro rodar por cima das policies
-- antigas (não precisa saber os nomes exatos: policies de SELECT são
-- permissivas por padrão no Postgres, então basta ADICIONAR uma nova
-- policy liberando leitura geral — ela passa a valer em OR com qualquer
-- policy restritiva que já exista, sem precisar apagar a antiga).
--
-- Contexto: a antiga página de entrada (pg-home, com a logo/estatísticas/
-- carrossel de sets) foi removida do site — a aba "🏠 Início" virou a
-- porta de entrada única (ver index.html/app.js/inicio.js). Pra isso não
-- virar um site que trava visitante sem conta numa tela de login vazia,
-- a Início passou a ser pública: novidades, notícias, vídeos, links e
-- revista ficam visíveis pra qualquer um, logado ou não. Comentar/curtir
-- continua exigindo login (checado em inicio.js via uid(), e as policies
-- de INSERT abaixo continuam intocadas — só abrimos leitura).
--
-- Tabelas: site_updates (Novidades), pokemon_news + pokemon_news_comments
-- (Notícias — leitura dos comentários também fica pública, só postar
-- continua exigindo auth.uid()), community_videos, community_links,
-- magazine_articles (home_content_setup.sql, 23/08/2026).
-- ================================================================

alter table site_updates          enable row level security;
alter table pokemon_news          enable row level security;
alter table pokemon_news_comments enable row level security;
alter table community_videos      enable row level security;
alter table community_links       enable row level security;
alter table magazine_articles     enable row level security;

drop policy if exists "inicio_public_read" on site_updates;
create policy "inicio_public_read" on site_updates
  for select using (true);
grant select on site_updates to anon;

drop policy if exists "inicio_public_read" on pokemon_news;
create policy "inicio_public_read" on pokemon_news
  for select using (true);
grant select on pokemon_news to anon;

drop policy if exists "inicio_public_read" on pokemon_news_comments;
create policy "inicio_public_read" on pokemon_news_comments
  for select using (true);
grant select on pokemon_news_comments to anon;

drop policy if exists "inicio_public_read" on community_videos;
create policy "inicio_public_read" on community_videos
  for select using (true);
grant select on community_videos to anon;

drop policy if exists "inicio_public_read" on community_links;
create policy "inicio_public_read" on community_links
  for select using (true);
grant select on community_links to anon;

drop policy if exists "inicio_public_read" on magazine_articles;
create policy "inicio_public_read" on magazine_articles
  for select using (true);
grant select on magazine_articles to anon;

-- Pra conferir depois de rodar:
-- select tablename, policyname from pg_policies where policyname = 'inicio_public_read';
