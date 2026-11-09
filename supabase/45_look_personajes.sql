-- Auri · descripción escrita de cada personaje (la hace la IA mirando su imagen; la autoría la puede corregir)
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor → Run.
alter table public.vn_characters add column if not exists look text check (look is null or length(look) <= 600);
alter table public.vn_characters add column if not exists look_src text;   -- imagen que se analizó (si cambia el sprite, se vuelve a analizar)
