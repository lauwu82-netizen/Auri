-- Auri · el marco de portada se elige por libro (editar o crear libro)
alter table public.stories add column if not exists cover_frame text;
