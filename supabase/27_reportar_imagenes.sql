-- =====================================================================
-- AURI · Reportar imágenes (portada de libro, foto y portada de perfil)
-- Ejecutar DESPUÉS de 25_imagenes_ia.sql (y 26_lazos.sql), en una consulta nueva del SQL Editor.
--
-- Reglas:
--  * Cualquier cuenta puede reportar una imagen ajena (una vez por imagen).
--  * Con 3 reportes de 3 cuentas distintas, la imagen llega a Moderación › Imágenes (estado "reported").
--    La imagen NO se oculta sola: el equipo decide (así nadie puede ocultar una imagen ajena con cuentas falsas).
--  * Con 1 o 2 reportes no llega a la cola, pero el equipo ve la cantidad y los motivos al entrar al libro.
-- =====================================================================

create table if not exists public.image_reports (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  reporter   uuid not null references public.profiles(id) on delete cascade,
  owner      uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'other',                 -- avatar | banner | cover | chapter | other
  story_id   text not null default '',
  community  text not null default 'es',
  reasons    text[] not null default '{}',
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (url, reporter)
);
create index if not exists image_reports_url_idx on public.image_reports(url);
create index if not exists image_reports_story_idx on public.image_reports(story_id);
alter table public.image_reports enable row level security;
revoke all on public.image_reports from anon, authenticated;

-- image_checks: nuevo estado "reported" y de dónde viene el aviso
alter table public.image_checks add column if not exists source text not null default 'ai';
do $$ begin
  alter table public.image_checks drop constraint if exists image_checks_status_check;
  alter table public.image_checks add constraint image_checks_status_check check (status in ('flagged','appealed','approved','rejected','reported'));
end $$;

-- reportar una imagen
create or replace function public.img_user_report(p_url text, p_kind text, p_story text, p_reasons text[], p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare own uuid; comm text; n int; me uuid := auth.uid();
begin
  if me is null then raise exception 'Inicia sesión para reportar'; end if;
  if p_url is null or length(p_url) > 600 then raise exception 'Imagen no válida'; end if;
  begin own := substring(p_url from '/([0-9a-fA-F-]{36})/[^/]+$')::uuid; exception when others then own := null; end;
  if own is null or not exists (select 1 from public.profiles where id = own) then raise exception 'No se puede reportar esta imagen'; end if;
  if own = me then raise exception 'No puedes reportar tus propias imágenes'; end if;
  select community into comm from public.profiles where id = own;
  insert into public.image_reports (url, reporter, owner, kind, story_id, community, reasons, note)
  values (p_url, me, own, coalesce(nullif(p_kind, ''), 'other'), coalesce(p_story, ''), coalesce(comm, 'es'), coalesce(p_reasons, '{}'), left(btrim(coalesce(p_note, '')), 300))
  on conflict (url, reporter) do nothing;
  if not found then raise exception 'Ya reportaste esta imagen'; end if;
  select count(*) into n from public.image_reports where url = p_url;
  if n >= 3 then       -- llega a la cola del equipo (si el equipo ya la decidió o la IA ya la marcó, no se repite)
    insert into public.image_checks (url, owner, community, kind, story_id, status, severity, source, note)
    values (p_url, own, coalesce(comm, 'es'), coalesce(nullif(p_kind, ''), 'other'), coalesce(p_story, ''), 'reported', 'soft', 'users', 'Reportada por ' || n || ' cuentas')
    on conflict (url) do nothing;
  end if;
  return n;
end $$;
grant execute on function public.img_user_report(text, text, text, text[], text) to authenticated;

-- el equipo: cantidad y motivos de los reportes de las imágenes de un libro (o de una cuenta si p_story = '')
create or replace function public.img_reports_of(p_story text, p_owner uuid default null)
returns table (url text, kind text, n bigint, items jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query
    select r.url, min(r.kind), count(*)::bigint,
           jsonb_agg(jsonb_build_object('by', p.name, 'reasons', r.reasons, 'note', r.note, 'at', r.created_at) order by r.created_at desc)
    from public.image_reports r join public.profiles p on p.id = r.reporter
    where public.in_scope(r.community) and ((p_story <> '' and r.story_id = p_story) or (p_owner is not null and r.owner = p_owner))
    group by r.url order by count(*) desc;
end $$;
grant execute on function public.img_reports_of(text, uuid) to authenticated;

-- cola del equipo: ahora incluye las reportadas y cuántas veces
drop function if exists public.img_queue();
create or replace function public.img_queue() returns table (url text, owner uuid, owner_name text, kind text, story_id text, status text, severity text, reasons jsonb, note text, created_at timestamptz, appealed_at timestamptz, reason text, handled_by uuid, handled_at timestamptz, source text, n_reports bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query
    select c.url, c.owner, p.name, c.kind, c.story_id, c.status, c.severity, c.reasons, c.note, c.created_at, c.appealed_at, c.reason, c.handled_by, c.handled_at, c.source,
           (select count(*) from public.image_reports r where r.url = c.url)
    from public.image_checks c join public.profiles p on p.id = c.owner
    where public.in_scope(c.community)
      and (c.status in ('appealed','reported') or (c.severity = 'hard' and c.handled_at is null) or (c.handled_at is not null and c.handled_at > now() - interval '14 days'))
    order by (c.status in ('appealed','reported')) desc, coalesce(c.appealed_at, c.created_at) desc limit 200;
end $$;
grant execute on function public.img_queue() to authenticated;

-- decidir: si fue un reporte de la gente y se aprueba, no se avisa a la autoría (nunca supo del reporte)
create or replace function public.img_decide(p_url text, p_ok boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.image_checks;
begin
  select * into r from public.image_checks where url = p_url;
  if not found then raise exception 'Esa imagen ya no está en la lista'; end if;
  if not public.is_staff() or not public.in_scope(r.community) then raise exception 'No tienes permiso para decidir sobre esta imagen'; end if;
  if r.owner = auth.uid() and not public.is_owner() then raise exception 'No puedes revisar tus propias imágenes'; end if;
  if p_ok then
    update public.image_checks set status = 'approved', reason = '', handled_by = auth.uid(), handled_at = now() where url = p_url;
    if r.source <> 'users' then
      insert into public.notifications (user_id, type, extra, href) values (r.owner, 'sys', 'Tu imagen fue revisada y aprobada: ya se ve para todos.', '#/images');
    end if;
    perform public.log_action('img-approve', r.owner::text, left(p_url, 120));
  else
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo del rechazo'; end if;
    update public.image_checks set status = 'rejected', reason = left(btrim(p_reason), 300), handled_by = auth.uid(), handled_at = now() where url = p_url;
    insert into public.notifications (user_id, type, extra, xv, href) values (r.owner, 'sys', 'Tu imagen fue revisada y rechazada: {n}', jsonb_build_object('n', left(btrim(p_reason), 300)), '#/images');
    perform public.log_action('img-reject', r.owner::text, left(btrim(p_reason), 100));
  end if;
end $$;
grant execute on function public.img_decide(text, boolean, text) to authenticated;
