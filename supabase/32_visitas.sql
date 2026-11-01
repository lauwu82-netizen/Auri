-- =====================================================================
-- AURI · Visualizaciones de los libros
-- Ejecutar DESPUÉS de 31_imagenes_chat.sql, en una consulta nueva del SQL Editor.
--
-- Una visualización cuenta cuando alguien abre un capítulo de un libro que no es suyo.
-- Cada persona suma como máximo una vez por libro y por día. Solo el servidor puede cambiar el número.
-- =====================================================================
alter table public.stories add column if not exists views integer not null default 0;

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer   uuid not null references public.profiles(id) on delete cascade,
  day      date not null default current_date,
  primary key (story_id, viewer, day)
);
alter table public.story_views enable row level security;
revoke all on public.story_views from anon, authenticated;

-- nadie (ni la autoría) puede cambiar el contador a mano
create or replace function public.guard_story() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('auri.vw', true), '') = '1' then new.updated_at := old.updated_at;   -- sumar una visita no cuenta como editar el libro
  else new.updated_at := now(); new.views := old.views; end if;
  if auth.uid() is not null and auth.uid() <> old.owner and not public.is_owner() then
    if new.owner is distinct from old.owner or new.title is distinct from old.title
       or new.synopsis is distinct from old.synopsis or new.cover is distinct from old.cover
       or new.community is distinct from old.community then
      raise exception 'Solo la autoría puede editar la historia';
    end if;
  end if;
  if new.owner is distinct from old.owner then raise exception 'No se puede cambiar la autoría'; end if;
  return new;
end $$;

-- sumar una visualización; devuelve el total
create or replace function public.story_view(p_story uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); own uuid; n integer;
begin
  if me is null then return null; end if;
  select owner, views into own, n from public.stories where id = p_story;
  if not found then return null; end if;
  if own = me then return n; end if;
  insert into public.story_views (story_id, viewer) values (p_story, me) on conflict do nothing;
  if found then
    perform set_config('auri.vw', '1', true);
    update public.stories set views = views + 1 where id = p_story returning views into n;
  end if;
  return n;
end $$;
revoke all on function public.story_view(uuid) from public, anon;
grant execute on function public.story_view(uuid) to authenticated;
