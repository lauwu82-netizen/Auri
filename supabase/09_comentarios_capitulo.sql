-- =====================================================================
-- AURI · Comentarios por capítulo
-- Ejecutar DESPUÉS de 08_encuestas.sql, en una consulta nueva del SQL Editor.
-- Cada capítulo tiene sus propios comentarios. chapter_pos es la posición del capítulo
-- (0 = capítulo 1, 1 = capítulo 2…). Los comentarios que ya existían quedan en el capítulo 1.
-- =====================================================================

alter table public.comments add column if not exists chapter_pos int not null default 0 check (chapter_pos >= 0);
drop index if exists public.comments_story_idx;
create index if not exists comments_story_idx on public.comments(story_id, chapter_pos, created_at);
