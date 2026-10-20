-- =====================================================================
-- AURI · Etapa 6: imágenes en Supabase Storage
-- Ejecutar DESPUÉS de 06_noticias.sql, en una consulta nueva del SQL Editor.
-- Crea el bucket público "images". Cada persona solo puede subir, cambiar o borrar
-- dentro de su propia carpeta (images/<su-id>/...); cualquiera puede ver las imágenes.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists img_read on storage.objects;
create policy img_read on storage.objects for select using (bucket_id = 'images');

drop policy if exists img_ins on storage.objects;
create policy img_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists img_upd on storage.objects;
create policy img_upd on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists img_del on storage.objects;
create policy img_del on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
