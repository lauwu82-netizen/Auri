-- Tema de color de la app elegido por cada persona (se ve al visitar su perfil)
alter table public.profiles add column if not exists accent text not null default '';
