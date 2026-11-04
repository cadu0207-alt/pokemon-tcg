-- ================================================================
-- MyDeck — FOTOS REAIS DE ITENS DE LEILÃO (leilao_fotos_storage_setup.sql)
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- Depois de já ter rodado leilao_setup.sql (usa a função is_auction_admin()
-- criada lá).
--
-- Cria o bucket de Storage onde ficam as fotos que o leiloeiro tira/envia
-- na hora de cadastrar um item — pra cartas fora do catálogo, produtos
-- diversos, ou quando quer mostrar o estado real do exemplar (em vez da
-- foto de referência do catálogo). Todo `create ... if not exists` e
-- `drop policy if exists` são seguros de repetir.
-- ================================================================

-- Coluna nova em auctions: guarda TODAS as fotos reais enviadas (até 4,
-- limite aplicado no client em leilao.js), na ordem escolhida. A primeira
-- também vira o `image_url` (capa que já aparece em toda a UI existente —
-- lista, card, PDF de compartilhamento). photo_urls só é usado a mais pra
-- mostrar a galeria completa no zoom.
alter table auctions add column if not exists photo_urls text[];

-- Bucket público pra leitura (a foto aparece pro site inteiro, mesmo sem
-- login, igual às imagens do catálogo) — só quem é is_auction_admin()
-- pode enviar, sobrescrever ou remover.
insert into storage.buckets (id, name, public)
values ('leilao-fotos', 'leilao-fotos', true)
on conflict (id) do nothing;

drop policy if exists "leilao-fotos leitura publica" on storage.objects;
create policy "leilao-fotos leitura publica"
  on storage.objects for select
  using (bucket_id = 'leilao-fotos');

drop policy if exists "leilao-fotos upload admin" on storage.objects;
create policy "leilao-fotos upload admin"
  on storage.objects for insert
  with check (bucket_id = 'leilao-fotos' and is_auction_admin());

drop policy if exists "leilao-fotos update admin" on storage.objects;
create policy "leilao-fotos update admin"
  on storage.objects for update
  using (bucket_id = 'leilao-fotos' and is_auction_admin())
  with check (bucket_id = 'leilao-fotos' and is_auction_admin());

drop policy if exists "leilao-fotos delete admin" on storage.objects;
create policy "leilao-fotos delete admin"
  on storage.objects for delete
  using (bucket_id = 'leilao-fotos' and is_auction_admin());
