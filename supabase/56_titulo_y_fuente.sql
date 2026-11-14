-- Auri · título equipado y fuente del nombre de perfil
alter table public.profiles add column if not exists title_sel text;
alter table public.profiles add column if not exists name_font text;
