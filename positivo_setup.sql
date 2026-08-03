-- ================================================================
-- MyDeck — CADASTRO POSITIVO DE EMPRESAS (positivo.js)
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
--
-- Vitrine de lojas que, até onde conseguimos verificar, vendem
-- produtos de Pokémon TCG a preço tabelado ou abaixo. Qualquer
-- usuário logado pode indicar uma loja (fica 'pendente' até
-- aprovação manual do admin). Não envolve CNPJ nem comissão —
-- é só uma lista de reputação, mais simples que trusted_stores.
-- ================================================================

create table if not exists positive_companies (
  id            uuid primary key default gen_random_uuid(),
  submitted_by  uuid references auth.users(id),
  nome          text not null,
  instagram     text,
  tiktok        text,
  site          text,
  cidade        text,
  uf            text,
  contato_dono  text,   -- opcional; visível só pro submitter e pro admin
  observacoes   text,
  status        text not null default 'pendente' check (status in ('pendente','ativa','rejeitada')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (nome)  -- evita duplicar a mesma loja se este script rodar de novo
);

-- Se a tabela já existia de uma versão anterior deste script (sem o unique(nome)),
-- adiciona a constraint agora sem quebrar caso ela já exista.
do $$ begin
  alter table positive_companies add constraint positive_companies_nome_key unique (nome);
exception when duplicate_object then null;
end $$;

alter table positive_companies enable row level security;

-- Qualquer usuário logado pode INDICAR uma loja (fica pendente até aprovação)
drop policy if exists "positive_companies_insert" on positive_companies;
create policy "positive_companies_insert" on positive_companies
  for insert with check (status = 'pendente');

-- Todo mundo vê lojas ativas; quem indicou vê a própria indicação mesmo pendente;
-- o admin (Eduardo) vê tudo.
drop policy if exists "positive_companies_select" on positive_companies;
create policy "positive_companies_select" on positive_companies
  for select using (
    status = 'ativa'
    or submitted_by = auth.uid()
    or auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
  );

-- Só o admin aprova/rejeita/edita
drop policy if exists "positive_companies_update_admin" on positive_companies;
create policy "positive_companies_update_admin" on positive_companies
  for update using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

drop policy if exists "positive_companies_delete_admin" on positive_companies;
create policy "positive_companies_delete_admin" on positive_companies
  for delete using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- ── SEED INICIAL (03/08/2026) ──────────────────────────────────
-- Lojas que o Eduardo já verificou vendendo a preço tabelado ou abaixo.
-- Entram direto como 'ativa' (não precisam passar pela fila de aprovação).
insert into positive_companies (nome, instagram, cidade, uf, status) values
  ('ManaCard Store',       'https://www.instagram.com/manacardstore',       'Campinas',                  'SP', 'ativa'),
  ('Eternatus Card House', 'https://www.instagram.com/eternatuscardhouse',  'Itu',                       'SP', 'ativa'),
  ('Loja Life Geek',       'https://www.instagram.com/lojalifegeek',        'Itu',                       'SP', 'ativa'),
  ('Shisui Store BR',      'https://www.instagram.com/shisuistorebr',       'Salto',                     'SP', 'ativa'),
  ('Arteus TCG',           'https://www.instagram.com/arteustcg',           'Cachoeiro de Itapemirim',   'ES', 'ativa'),
  ('Tuzzy Cards',          'https://www.instagram.com/tuzzycards',          'Barueri',                   'SP', 'ativa'),
  ('USA Trendies',         'https://www.instagram.com/usatrendies',         'Santo André',               'SP', 'ativa'),
  ('Voltz TCG',            'https://www.instagram.com/voltztcg',            'Curitiba',                  'PR', 'ativa')
on conflict (nome) do nothing;

-- Pra conferir depois de rodar:
-- select * from positive_companies order by created_at desc;
