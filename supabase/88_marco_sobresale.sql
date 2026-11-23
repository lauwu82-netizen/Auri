-- Auri · cuánto sobresale el marco de portada de cada libro (0 a 8; vacío = valor por defecto)
alter table public.stories add column if not exists cover_frame_out smallint check (cover_frame_out between 0 and 8);
