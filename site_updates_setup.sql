-- ================================================================
-- MyDeck — LOG DE ATUALIZAÇÕES (site_updates_setup.sql)
-- Mural de novidades do site: o admin (Eduardo) publica mensagens
-- curtas ("adicionei X", "corrigi Y") e todo usuário logado vê a
-- lista mais recente no Dashboard. Mesmo padrão de segurança do
-- feedback_messages/admin_dashboard_stats: RLS na tabela, checagem
-- de admin pelo próprio auth.uid() (não precisa de RPC aqui porque
-- não há join com auth.users).
-- ================================================================

create table if not exists site_updates (
  id bigint generated always as identity primary key,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table site_updates enable row level security;

-- Qualquer usuário logado pode ler o mural
drop policy if exists "updates_select_all" on site_updates;
create policy "updates_select_all" on site_updates
  for select using (auth.uid() is not null);

-- Só o Eduardo pode publicar/editar/apagar
drop policy if exists "updates_admin_insert" on site_updates;
create policy "updates_admin_insert" on site_updates
  for insert with check (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

drop policy if exists "updates_admin_update" on site_updates;
create policy "updates_admin_update" on site_updates
  for update using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

drop policy if exists "updates_admin_delete" on site_updates;
create policy "updates_admin_delete" on site_updates
  for delete using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');
