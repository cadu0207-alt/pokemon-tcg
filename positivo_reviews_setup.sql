-- ================================================================
-- MyDeck — AVALIAÇÕES DO CADASTRO POSITIVO (positivo.js)
-- Execute no Supabase SQL Editor DEPOIS de positivo_setup.sql
-- (app.supabase.com → SQL Editor → Run)
--
-- Cada usuário logado pode dar 1 nota (1-5) + elogio ou reclamação
-- por loja do Cadastro Positivo. Se avaliar de novo a mesma loja,
-- atualiza a própria avaliação em vez de criar uma nova (upsert por
-- company_id+user_id) — assim a nota não fica "inflada" por review-bombing
-- de uma pessoa só.
-- ================================================================

create table if not exists company_reviews (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references positive_companies(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id),
  nota         int not null check (nota between 1 and 5),
  tipo         text not null check (tipo in ('elogio','reclamacao')),
  comentario   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, user_id)
);

alter table company_reviews enable row level security;

-- Todo mundo logado lê as avaliações — transparência é o ponto da lista
drop policy if exists "company_reviews_select" on company_reviews;
create policy "company_reviews_select" on company_reviews
  for select using (auth.uid() is not null);

-- Só o próprio usuário cria/edita/apaga a avaliação dele
drop policy if exists "company_reviews_insert" on company_reviews;
create policy "company_reviews_insert" on company_reviews
  for insert with check (user_id = auth.uid());

drop policy if exists "company_reviews_update" on company_reviews;
create policy "company_reviews_update" on company_reviews
  for update using (user_id = auth.uid());

-- O usuário pode apagar a própria avaliação; o admin também, se precisar
-- remover um review abusivo/spam.
drop policy if exists "company_reviews_delete" on company_reviews;
create policy "company_reviews_delete" on company_reviews
  for delete using (
    user_id = auth.uid()
    or auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
  );

-- Pra conferir depois de rodar:
-- select c.nome, r.nota, r.tipo, r.comentario, r.created_at
-- from company_reviews r join positive_companies c on c.id = r.company_id
-- order by r.created_at desc;
