-- =====================================================================
-- AURI · "Leyendo…" opcional en el perfil
-- Ejecutar DESPUÉS de 28_estados.sql, en una consulta nueva del SQL Editor.
--
-- Reglas:
--  * Está APAGADO por defecto: cada persona lo activa en Editar perfil (profiles.show_reading).
--  * Solo se registra el libro que lees ahora y solo se muestra si lo leíste hace menos de 12 horas.
--  * Nunca se muestra si el libro es +18 o privado, ni a quien bloqueó o fue bloqueado por esa persona.
--  * Al apagar la opción, el registro se borra.
-- =====================================================================

alter table public.profiles add column if not exists show_reading boolean not null default false;

create table if not exists public.reading (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  at       timestamptz not null default now()
);
alter table public.reading enable row level security;
revoke all on public.reading from anon, authenticated;          -- todo pasa por las funciones de abajo

create or replace function public.reading_set(p_story uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); st public.stories;
begin
  if me is null then return; end if;
  if not coalesce((select show_reading from public.profiles where id = me), false) then delete from public.reading where user_id = me; return; end if;
  select * into st from public.stories where id = p_story;
  if not found or st.private or st.mature or st.owner = me
     or not exists (select 1 from public.chapter_published p where p.story_id = st.id) then
    delete from public.reading where user_id = me; return;
  end if;
  insert into public.reading (user_id, story_id, at) values (me, st.id, now())
  on conflict (user_id) do update set story_id = excluded.story_id, at = now();
end $$;

create or replace function public.reading_clear() returns void
language sql security definer set search_path = public as
$$ delete from public.reading where user_id = auth.uid() $$;

create or replace function public.reading_of(p_user uuid) returns table (story_id uuid, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select r.story_id, r.at from public.reading r
    join public.profiles p on p.id = r.user_id and p.show_reading
    join public.stories st on st.id = r.story_id and not st.private and not st.mature
    where r.user_id = p_user and r.at > now() - interval '12 hours'
      and (r.user_id = me or not exists (select 1 from public.blocks b where
            (b.kind = 'block' and ((b.blocker = me and b.blocked = r.user_id) or (b.blocker = r.user_id and b.blocked = me)))
            or (b.kind = 'mute' and b.blocker = me and b.blocked = r.user_id)));
end $$;

revoke all on function public.reading_set(uuid), public.reading_clear(), public.reading_of(uuid) from public, anon;
grant execute on function public.reading_set(uuid), public.reading_clear(), public.reading_of(uuid) to authenticated;
