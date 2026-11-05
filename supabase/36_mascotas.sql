-- Mascota 8-bit del perfil (clave corta: gato, perro, conejo...). Solo guarda cuál eligió cada cuenta.
alter table public.profiles add column if not exists pet text;
alter table public.profiles drop constraint if exists profiles_pet_check;
alter table public.profiles add constraint profiles_pet_check check (pet is null or pet ~ '^[a-z0-9_-]{1,24}$');
