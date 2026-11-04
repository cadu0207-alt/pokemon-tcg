-- Notícias do Início: envio de imagem pelo próprio formulário (09/10/2026)
--
-- Antes: o formulário "Notícia do mundo Pokémon" (home_content_admin.js) só aceitava o LINK de uma imagem
-- (media_url). Quem não tinha o link — foto do computador/celular, print, imagem copiada — não conseguia
-- ilustrar a matéria. Agora a tela envia o arquivo para este bucket e preenche o link sozinha.
--
-- Bucket público de leitura (a imagem aparece no feed pra qualquer visitante, como em leilao-fotos); escrita só
-- para quem tem a permissão 'inicio' (o admin e a equipe liberada em staff_access) — mesma regra da tabela
-- pokemon_news (is_staff_for('inicio')). Limite de 5 MB e só formatos de imagem; a tela ainda reduz e converte
-- pra WebP antes de enviar (~100–300 KB), pra não pesar no plano gratuito (1 GB de arquivos).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', true, 5242880, array['image/webp','image/jpeg','image/png','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "news-images leitura publica" on storage.objects;
create policy "news-images leitura publica" on storage.objects
  for select using (bucket_id = 'news-images');

drop policy if exists "news-images upload staff" on storage.objects;
create policy "news-images upload staff" on storage.objects
  for insert with check (bucket_id = 'news-images' and public.is_staff_for('inicio'));

drop policy if exists "news-images update staff" on storage.objects;
create policy "news-images update staff" on storage.objects
  for update using (bucket_id = 'news-images' and public.is_staff_for('inicio'))
  with check (bucket_id = 'news-images' and public.is_staff_for('inicio'));

drop policy if exists "news-images delete staff" on storage.objects;
create policy "news-images delete staff" on storage.objects
  for delete using (bucket_id = 'news-images' and public.is_staff_for('inicio'));
