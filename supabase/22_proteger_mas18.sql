-- Proteger la marca +18: una obra con capítulos aprobados NO puede quitarse el +18 desde la API.
-- Solo el equipo (moderación, administración, Owner) puede hacerlo, por ejemplo al aprobar una solicitud.
-- Si la autoría intenta desmarcarlo, la marca simplemente se conserva.
create or replace function public.guard_story() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and auth.uid() <> old.owner and not public.is_owner() then
    if new.owner is distinct from old.owner or new.title is distinct from old.title
       or new.synopsis is distinct from old.synopsis or new.cover is distinct from old.cover
       or new.community is distinct from old.community then
      raise exception 'Solo la autoría puede editar la historia';
    end if;
  end if;
  if new.owner is distinct from old.owner then raise exception 'No se puede cambiar la autoría'; end if;
  if old.mature and not new.mature and auth.uid() is not null and not public.is_staff()
     and exists (select 1 from public.chapters c where c.story_id = old.id and c.status = 'approved') then
    new.mature := true;
  end if;
  return new;
end $$;
