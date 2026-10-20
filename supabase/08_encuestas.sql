-- =====================================================================
-- AURI · Encuestas en el banner de Inicio
-- Ejecutar DESPUÉS de 07_imagenes.sql, en una consulta nueva del SQL Editor.
-- Una encuesta es una tarjeta del banner de tipo 'poll': la pregunta va en "title"
-- y las opciones y la fecha de cierre en la columna "poll".
-- Cada persona vota una sola vez y no puede cambiar su voto.
-- Los resultados solo se ven después de votar (o cuando la encuesta ya cerró, o si eres del equipo).
-- =====================================================================

alter table public.banners drop constraint if exists banners_kind_check;
alter table public.banners add constraint banners_kind_check check (kind in ('book','event','poll'));
alter table public.banners add column if not exists poll jsonb;

create table if not exists public.poll_votes (
  banner_id uuid not null references public.banners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  opt int not null check (opt >= 0 and opt < 6),
  created_at timestamptz not null default now(),
  primary key (banner_id, user_id)
);
alter table public.poll_votes enable row level security;
-- sin políticas: nadie lee ni escribe la tabla directamente; todo pasa por las funciones de abajo

-- ¿Está cerrada? (la fecha de cierre incluye ese día completo)
create or replace function public.poll_closed(p jsonb) returns boolean
language sql immutable as $$
  select coalesce(nullif(p ->> 'ends', '') ~ '^\d{4}-\d{2}-\d{2}$' and (p ->> 'ends')::date < (now() at time zone 'utc')::date, false)
$$;

-- Votar
create or replace function public.vote_poll(bid uuid, option_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare b public.banners; n int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para votar.'; end if;
  select * into b from public.banners where id = bid and kind = 'poll' and status = 'approved';
  if not found then raise exception 'Esa encuesta ya no está disponible.'; end if;
  if b.comm <> 'all' and b.comm is distinct from (select community from public.profiles where id = auth.uid()) then
    raise exception 'Esa encuesta no está disponible para tu comunidad.';
  end if;
  if public.poll_closed(b.poll) then raise exception 'Esa encuesta ya cerró.'; end if;
  n := coalesce(jsonb_array_length(b.poll -> 'options'), 0);
  if option_idx is null or option_idx < 0 or option_idx >= n then raise exception 'Elige una opción válida.'; end if;
  insert into public.poll_votes (banner_id, user_id, opt) values (bid, auth.uid(), option_idx)
  on conflict do nothing;
  if not found then raise exception 'Ya votaste en esta encuesta.'; end if;
end $$;

-- Resultados: una fila por opción con votos (opt, n) y una fila opt = -1 con "mi voto" en n (o -2 si no he votado)
create or replace function public.poll_counts(bids uuid[]) returns table (banner_id uuid, opt int, n bigint)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  return query
  with mine as (select v.banner_id as bid, v.opt from public.poll_votes v where v.user_id = uid),
  vis as (
    select b.id from public.banners b
    where b.id = any (bids) and b.kind = 'poll' and b.status = 'approved'
      and (public.poll_closed(b.poll) or public.is_staff() or exists (select 1 from mine m where m.bid = b.id))
  )
  select v.banner_id, v.opt, count(*)::bigint from public.poll_votes v where v.banner_id in (select id from vis) group by v.banner_id, v.opt
  union all
  select b.id, -1, coalesce((select m.opt from mine m where m.bid = b.id), -2)::bigint from public.banners b where b.id = any (bids) and b.kind = 'poll';
end $$;

grant execute on function public.poll_closed(jsonb) to anon, authenticated;
grant execute on function public.vote_poll(uuid, int) to authenticated;
grant execute on function public.poll_counts(uuid[]) to anon, authenticated;
