-- =====================================================================
-- AURI · Estados (burbujas): pensamiento o libro recomendado, duran 24 horas
-- Ejecutar DESPUÉS de 27_reportar_imagenes.sql, en una consulta nueva del SQL Editor.
--
-- Reglas:
--  * Un solo estado por persona: si publica otro, reemplaza al anterior. Dura 24 h.
--  * Pensamiento: hasta 140 caracteres, sin enlaces, correos ni teléfonos. Las cuentas adultas pueden marcarlo +18.
--  * Recomendación: un libro publicado de otra persona (no privado; si es +18, solo para mayores de edad).
--  * Lo ven: la propia persona y quienes la siguen. Nadie ve el estado de quien lo bloqueó o lo bloqueó a esa persona,
--    ni el de cuentas silenciadas.
--  * Menores: no ven los pensamientos de cuentas adultas (sí las recomendaciones). Los pensamientos +18 solo los ven mayores.
-- =====================================================================

create table if not exists public.statuses (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('thought','rec')),
  text       text not null default '' check (length(text) <= 140),
  story_id   uuid references public.stories(id) on delete cascade,
  mature     boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check ((kind = 'thought' and length(btrim(text)) > 0 and story_id is null) or (kind = 'rec' and story_id is not null))
);
create index if not exists statuses_exp_idx on public.statuses(expires_at);
alter table public.statuses enable row level security;
revoke all on public.statuses from anon, authenticated;          -- todo pasa por las funciones de abajo

create or replace function public.status_set(p_kind text, p_text text, p_story uuid, p_mature boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); st public.stories; mat boolean := false;
begin
  if me is null then raise exception 'Inicia sesión para publicar'; end if;
  delete from public.statuses where expires_at < now();
  if p_kind = 'thought' then
    if length(t) < 1 or length(t) > 140 then raise exception 'El pensamiento debe tener entre 1 y 140 caracteres'; end if;
    if t ~* '(https?://|www\.|[a-z0-9._-]+@[a-z0-9-]+\.|[0-9][0-9 .-]{6,}[0-9])' then
      raise exception 'Los pensamientos no pueden incluir enlaces, correos ni números de teléfono';
    end if;
    mat := coalesce(p_mature, false) and public.is_adult(me);
    insert into public.statuses (user_id, kind, text, story_id, mature, created_at, expires_at)
    values (me, 'thought', t, null, mat, now(), now() + interval '24 hours')
    on conflict (user_id) do update set kind = 'thought', text = excluded.text, story_id = null, mature = excluded.mature, created_at = now(), expires_at = now() + interval '24 hours';
  elsif p_kind = 'rec' then
    select * into st from public.stories where id = p_story;
    if not found or st.private then raise exception 'Ese libro no está disponible'; end if;
    if st.owner = me then raise exception 'Solo puedes recomendar libros de otras personas'; end if;
    if not exists (select 1 from public.chapter_published p where p.story_id = st.id) then raise exception 'Ese libro aún no está publicado'; end if;
    if st.mature and not public.is_adult(me) then raise exception 'Ese libro no está disponible para tu cuenta'; end if;
    insert into public.statuses (user_id, kind, text, story_id, mature, created_at, expires_at)
    values (me, 'rec', '', st.id, st.mature, now(), now() + interval '24 hours')
    on conflict (user_id) do update set kind = 'rec', text = '', story_id = excluded.story_id, mature = excluded.mature, created_at = now(), expires_at = now() + interval '24 hours';
  else
    raise exception 'Tipo de estado no válido';
  end if;
end $$;

create or replace function public.status_clear() returns void
language sql security definer set search_path = public as
$$ delete from public.statuses where user_id = auth.uid() $$;

-- p_user null: tu estado y el de quienes sigues. Con p_user: el estado de esa persona (para su perfil).
create or replace function public.status_feed(p_user uuid default null)
returns table (user_id uuid, kind text, text text, story_id uuid, mature boolean, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); adult boolean;
begin
  if me is null then return; end if;
  adult := public.is_adult(me);
  return query
    select s.user_id, s.kind, s.text, s.story_id, s.mature, s.created_at, s.expires_at
    from public.statuses s
    where s.expires_at > now()
      and ((p_user is null and (s.user_id = me or exists (select 1 from public.follows f where f.follower = me and f.followee = s.user_id)))
           or (p_user is not null and s.user_id = p_user))
      and (s.user_id = me or (
            not exists (select 1 from public.blocks b where
                (b.kind = 'block' and ((b.blocker = me and b.blocked = s.user_id) or (b.blocker = s.user_id and b.blocked = me)))
                or (b.kind = 'mute' and b.blocker = me and b.blocked = s.user_id))
        and (s.kind = 'rec' or public.is_adult(s.user_id) = adult)
        and (not s.mature or adult)
        and (s.kind = 'thought' or exists (select 1 from public.stories st where st.id = s.story_id and not st.private and (not st.mature or adult)))
      ))
    order by s.created_at desc limit 200;
end $$;

revoke all on function public.status_set(text, text, uuid, boolean), public.status_clear(), public.status_feed(uuid) from public, anon;
grant execute on function public.status_set(text, text, uuid, boolean), public.status_clear(), public.status_feed(uuid) to authenticated;
