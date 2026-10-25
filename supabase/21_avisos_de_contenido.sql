-- Avisos de contenido que marca la autoria en cada libro
alter table public.stories add column if not exists warnings text[] not null default '{}';
