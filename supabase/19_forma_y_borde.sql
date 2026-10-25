-- Forma y borde de la foto de perfil (por ahora solo la Owner; la app solo los muestra si la cuenta es Owner)
alter table public.profiles add column if not exists photo_shape text not null default '';
alter table public.profiles add column if not exists halo text not null default '';
