-- ================================================================
-- MyDeck — FICHÁRIO · Migração: persistir quantidade e origem no Supabase
--
-- Problema encontrado (13/07/2026): a quantidade de cópias repetidas de
-- cada carta (qty) e a origem (de onde veio) só eram salvas no
-- localStorage do navegador — nunca na tabela `collection`. Isso fazia
-- essa informação "sumir" ao trocar de navegador/dispositivo ou limpar
-- dados do site, e o Dashboard nunca conseguia somar valor por
-- quantidade (só contava "tenho/não tenho" uma vez por carta).
--
-- Esta migração adiciona as colunas que faltavam. Depois de rodar,
-- app.js e fichario_patch.js passam a ler/escrever nelas.
-- ================================================================

alter table collection
  add column if not exists quantity integer not null default 1;

alter table collection
  add column if not exists origins jsonb not null default '[]'::jsonb;

-- Garante que nenhuma linha existente fique com quantity nula/zerada
update collection set quantity = 1 where quantity is null or quantity < 1;

-- Pra conferir depois de rodar:
-- select slot_key, quantity, origins from collection where user_id = auth.uid() limit 20;
