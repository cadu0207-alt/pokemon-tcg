-- ================================================================
-- MyDeck — CAIXA DE OPINIÕES DOS TESTADORES (feedback-beta.html) — 08/11/2026
-- (A tabela feedback_messages já existe e é do "Fale conosco" do site — por isso estas se chamam tester_*.)
--
-- O testador (André) escreve uma opinião, anexa prints, e a conversa fica
-- num fio por item. Quem lê/responde é o admin (Eduardo) e o Claude (que
-- escreve pelo banco, com service role — por isso não tem política própria).
--
-- • tester_items    : 1 linha por opinião (texto + URLs dos prints + status)
-- • tester_msgs : fio de conversa (autor: usuario | claude | eduardo)
-- • bucket PÚBLICO feedback-prints (5 MB, só imagem). Nomes são UUID (não
--   adivinháveis); pasta = id do usuário; só o dono grava na própria pasta.
--   Público de propósito: o Claude precisa baixar a imagem para analisar.
-- Admin = mk_is_admin() (mesma conta do restante do site). Idempotente.
-- ================================================================

create table if not exists public.tester_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'melhoria' check (kind in ('melhoria','problema','duvida')),
  area       text,
  body       text not null check (char_length(body) between 3 and 4000),
  images     text[] not null default '{}' check (cardinality(images) <= 6),
  status     text not null default 'novo' check (status in ('novo','analisando','respondido','aprovado','feito','descartado')),
  created_at timestamptz not null default now()
);
create index if not exists tester_items_user_idx   on public.tester_items (user_id, created_at desc);
create index if not exists tester_items_status_idx on public.tester_items (status, created_at desc);

create table if not exists public.tester_msgs (
  id         bigint generated always as identity primary key,
  item_id    uuid not null references public.tester_items(id) on delete cascade,
  author     text not null check (author in ('usuario','claude','eduardo')),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists tester_msgs_item_idx on public.tester_msgs (item_id, created_at);

alter table public.tester_items    enable row level security;
alter table public.tester_msgs enable row level security;

-- itens: dono lê os seus; admin lê tudo; dono cria (sempre com status 'novo'); só admin altera/apaga
drop policy if exists tst_items_select on public.tester_items;
create policy tst_items_select on public.tester_items for select to authenticated
  using (user_id = auth.uid() or public.mk_is_admin());
drop policy if exists tst_items_insert on public.tester_items;
create policy tst_items_insert on public.tester_items for insert to authenticated
  with check (user_id = auth.uid() and status = 'novo');
drop policy if exists tst_items_update on public.tester_items;
create policy tst_items_update on public.tester_items for update to authenticated
  using (public.mk_is_admin()) with check (public.mk_is_admin());
drop policy if exists tst_items_delete on public.tester_items;
create policy tst_items_delete on public.tester_items for delete to authenticated
  using (public.mk_is_admin());

-- mensagens: lê quem vê o item; dono responde como 'usuario' nos próprios itens; admin escreve como quiser
drop policy if exists tst_msgs_select on public.tester_msgs;
create policy tst_msgs_select on public.tester_msgs for select to authenticated
  using (public.mk_is_admin() or exists (select 1 from public.tester_items i where i.id = tester_msgs.item_id and i.user_id = auth.uid()));
drop policy if exists tst_msgs_insert on public.tester_msgs;
create policy tst_msgs_insert on public.tester_msgs for insert to authenticated
  with check (
    public.mk_is_admin()
    or (author = 'usuario' and exists (select 1 from public.tester_items i where i.id = tester_msgs.item_id and i.user_id = auth.uid()))
  );

-- bucket de prints
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-prints', 'feedback-prints', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "feedback-prints upload proprio" on storage.objects;
create policy "feedback-prints upload proprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-prints' and (storage.foldername(name))[1] = auth.uid()::text);
