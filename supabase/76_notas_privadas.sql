-- Notas privadas por historia (tarjetas dentro del editor). Solo la autoria de la historia las ve.
-- Se puede correr varias veces. No toca pass_rewards ni migraciones anteriores.

create table if not exists public.story_notes (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null default $q$$q$ check (char_length(title) <= 80),
  body text not null default $q$$q$ check (char_length(body) <= 5000),
  pos integer not null default 0,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists story_notes_story_idx on public.story_notes (story_id, pos);
create index if not exists story_notes_owner_idx on public.story_notes (owner);

alter table public.story_notes enable row level security;

-- Lectura: solo quien escribe la historia. Ni moderacion ni Owner entran por aqui.
drop policy if exists story_notes_select_own on public.story_notes;
create policy story_notes_select_own on public.story_notes for select to authenticated
  using (
    owner = auth.uid()
    and exists (select 1 from public.stories s where s.id = story_notes.story_id and s.owner = auth.uid())
  );

-- Nadie escribe directo: todo pasa por las funciones de abajo (revisan propiedad, limites y version).
revoke all on public.story_notes from anon, authenticated;
grant select on public.story_notes to authenticated;

-- Guardar una nota (crear o editar). p_base = version que tenia el dispositivo; si no coincide, hay conflicto y NO se pisa nada.
create or replace function public.note_save(p_id uuid, p_story uuid, p_title text, p_body text, p_base integer)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
  so uuid;
  r public.story_notes;
  ti text := coalesce(p_title, $q$$q$);
  bo text := coalesce(p_body, $q$$q$);
begin
  if me is null then return jsonb_build_object($q$status$q$, $q$auth$q$); end if;
  if char_length(ti) > 80 or char_length(bo) > 5000 then return jsonb_build_object($q$status$q$, $q$too_long$q$); end if;
  select owner into so from public.stories where id = p_story;
  if so is null then return jsonb_build_object($q$status$q$, $q$no_story$q$); end if;
  if so <> me then return jsonb_build_object($q$status$q$, $q$forbidden$q$); end if;

  select * into r from public.story_notes where id = p_id for update;
  if not found then
    if (select count(*) from public.story_notes where story_id = p_story) >= 300 then
      return jsonb_build_object($q$status$q$, $q$too_many$q$);
    end if;
    begin
      insert into public.story_notes (id, story_id, owner, title, body, pos, version)
      values (p_id, p_story, me, ti, bo, coalesce((select max(pos) + 1 from public.story_notes where story_id = p_story), 0), 1)
      returning * into r;
    exception when unique_violation then
      select * into r from public.story_notes where id = p_id;
      if r.owner <> me then return jsonb_build_object($q$status$q$, $q$forbidden$q$); end if;
      return jsonb_build_object($q$status$q$, $q$conflict$q$, $q$row$q$, to_jsonb(r));
    end;
    return jsonb_build_object($q$status$q$, $q$ok$q$, $q$version$q$, r.version, $q$pos$q$, r.pos);
  end if;

  if r.owner <> me or r.story_id <> p_story then return jsonb_build_object($q$status$q$, $q$forbidden$q$); end if;

  -- reintento de una creacion que ya se guardo (la respuesta se perdio): mismo contenido = todo bien, sin duplicar
  if p_base = 0 and r.title = ti and r.body = bo then
    return jsonb_build_object($q$status$q$, $q$ok$q$, $q$version$q$, r.version, $q$pos$q$, r.pos);
  end if;
  if r.version <> p_base then
    if r.title = ti and r.body = bo then
      return jsonb_build_object($q$status$q$, $q$ok$q$, $q$version$q$, r.version, $q$pos$q$, r.pos);
    end if;
    return jsonb_build_object($q$status$q$, $q$conflict$q$, $q$row$q$, to_jsonb(r));
  end if;

  update public.story_notes
     set title = ti, body = bo, version = version + 1, deleted_at = null, updated_at = now()
   where id = p_id
   returning * into r;
  return jsonb_build_object($q$status$q$, $q$ok$q$, $q$version$q$, r.version, $q$pos$q$, r.pos);
end $fn$;

-- Orden de las tarjetas (lista de ids en el orden que quieres)
create or replace function public.note_order(p_story uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare me uuid := auth.uid(); so uuid;
begin
  if me is null then return jsonb_build_object($q$status$q$, $q$auth$q$); end if;
  select owner into so from public.stories where id = p_story;
  if so is null then return jsonb_build_object($q$status$q$, $q$no_story$q$); end if;
  if so <> me then return jsonb_build_object($q$status$q$, $q$forbidden$q$); end if;
  update public.story_notes n
     set pos = x.ord - 1
    from unnest(coalesce(p_ids, array[]::uuid[])) with ordinality as x(id, ord)
   where n.id = x.id and n.story_id = p_story and n.owner = me;
  return jsonb_build_object($q$status$q$, $q$ok$q$);
end $fn$;

-- Borrar (se puede recuperar 30 dias) o recuperar una nota
create or replace function public.note_delete(p_id uuid, p_restore boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare me uuid := auth.uid(); r public.story_notes;
begin
  if me is null then return jsonb_build_object($q$status$q$, $q$auth$q$); end if;
  select * into r from public.story_notes where id = p_id;
  if not found then return jsonb_build_object($q$status$q$, $q$missing$q$); end if;
  if r.owner <> me or not exists (select 1 from public.stories s where s.id = r.story_id and s.owner = me) then
    return jsonb_build_object($q$status$q$, $q$forbidden$q$);
  end if;
  update public.story_notes set deleted_at = case when coalesce(p_restore, false) then null else now() end where id = p_id;
  delete from public.story_notes where owner = me and deleted_at is not null and deleted_at < now() - interval $q$30 days$q$;
  return jsonb_build_object($q$status$q$, $q$ok$q$);
end $fn$;

revoke all on function public.note_save(uuid, uuid, text, text, integer) from public, anon;
revoke all on function public.note_order(uuid, uuid[]) from public, anon;
revoke all on function public.note_delete(uuid, boolean) from public, anon;
grant execute on function public.note_save(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.note_order(uuid, uuid[]) to authenticated;
grant execute on function public.note_delete(uuid, boolean) to authenticated;
