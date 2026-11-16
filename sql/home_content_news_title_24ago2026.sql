-- ================================================================
-- Migração 24/08/2026 — título e subtítulo em pokemon_news
-- Pedido do Eduardo: a notícia da aba Início vira "matéria" de verdade
-- (título + subtítulo + texto, com tela de leitura própria em
-- inicio.js/openInicioArticle), não mais um textarea solto sem título.
--
-- ATENÇÃO: rodar DEPOIS de home_content_setup.sql (23/08/2026) já ter
-- sido executado no seu Supabase — este arquivo só adiciona colunas
-- na tabela pokemon_news que aquele criou.
--
-- Observação sobre home_content_setup.sql: esse arquivo original não
-- está versionado no repositório (procurei e não achei) — só existe
-- dentro do seu Supabase. Recomendo exportar a definição das tabelas
-- pokemon_news/pokemon_news_views/pokemon_news_comments/community_
-- videos/community_links/magazine_articles (SQL Editor → Database →
-- Tables → "..." → Definition, ou pg_dump) e commitar no repo, senão
-- se precisar recriar isso em outro ambiente um dia essa informação
-- não está em lugar nenhum versionado. Não refiz esse arquivo do zero
-- aqui de propósito — arriscaria descrever RLS/policies diferente do
-- que já está rodando de verdade no seu banco.
-- ================================================================

alter table public.pokemon_news
  add column if not exists title text,
  add column if not exists subtitle text;

comment on column public.pokemon_news.title is 'Título da matéria — obrigatório no formulário admin a partir de 24/08/2026; nulo em notícias publicadas antes disso.';
comment on column public.pokemon_news.subtitle is 'Subtítulo opcional da matéria.';

-- Notícias antigas (title = null): inicio.js já trata isso — usa os
-- primeiros ~70 caracteres do corpo como título no card do feed.
