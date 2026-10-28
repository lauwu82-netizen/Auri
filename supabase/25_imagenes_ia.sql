-- =====================================================================
-- AURI · Revisión de imágenes con IA (foto de perfil, banner, portadas de libro y de capítulo)
-- Ejecutar DESPUÉS de 24_biografia_500.sql, en una consulta nueva del SQL Editor.
--
-- Cómo funciona:
--  1. Quien sube una imagen la deja en Storage como siempre.
--  2. La app le pide a la Edge Function "moderate-image" que la revise (OpenAI, gratis).
--  3. Limpia  -> no pasa nada (no se guarda ningún registro).
--     Marcada -> la imagen se oculta para todos (se ve el relleno: inicial, degradado o portada simple),
--                el libro o el perfil siguen funcionando, y la persona puede decir "es un error".
--     Muy grave -> se rechaza directo, sin botón de error (moderación igual la ve).
--  4. Si la persona apela, la imagen pasa a la pestaña "Imágenes" de moderación (y a la revisión del libro),
--     donde se aprueba o se rechaza.
-- Solo la Edge Function (service_role) puede registrar imágenes marcadas.
-- =====================================================================

create table if not exists public.image_checks (
  url         text primary key,
  owner       uuid not null references public.profiles(id) on delete cascade,
  community   text not null default 'es',
  kind        text not null default 'other',                 -- avatar | banner | cover | chapter | other
  story_id   text not null default '',                      -- para ubicarla dentro de la revisión del libro (id del libro)
  status      text not null check (status in ('flagged','appealed','approved','rejected')),
  severity    text not null default 'soft' check (severity in ('soft','hard')),
  reasons     jsonb,
  note        text not null default '',                      -- lo que escribe quien apela
  reason      text not null default '',                      -- motivo del equipo al rechazar
  created_at  timestamptz not null default now(),
  appealed_at timestamptz,
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz
);
create index if not exists image_checks_owner_idx on public.image_checks(owner);
create index if not exists image_checks_status_idx on public.image_checks(status);
alter table public.image_checks enable row level security;
revoke all on public.image_checks from anon, authenticated;     -- todo pasa por las funciones de abajo

-- la Edge Function registra una imagen marcada
create or replace function public.img_report(p_owner uuid, p_url text, p_kind text, p_story text, p_severity text, p_reasons jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare comm text; st text;
begin
  if p_severity not in ('soft','hard') then raise exception 'severidad inválida'; end if;
  select community into comm from public.profiles where id = p_owner; if comm is null then return 'missing'; end if;
  st := case when p_severity = 'hard' then 'rejected' else 'flagged' end;
  insert into public.image_checks (url, owner, community, kind, story_id, status, severity, reasons)
  values (p_url, p_owner, comm, coalesce(p_kind, 'other'), coalesce(p_story, ''), st, p_severity, p_reasons)
  on conflict (url) do nothing;
  if found then
    insert into public.notifications (user_id, type, extra, href)
    values (p_owner, 'sys', case when p_severity = 'hard' then 'Una de tus imágenes no cumple las reglas de Auri y se ocultó.' else 'Una de tus imágenes fue marcada automáticamente y se ocultó. Si crees que fue un error, puedes pedir una revisión.' end, '#/images');
  end if;
  return st;
end $$;
revoke all on function public.img_report(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.img_report(uuid, text, text, text, text, jsonb) to service_role;

-- imágenes ocultas (las ve cualquiera para poner el relleno; no revela motivos ni dueños)
create or replace function public.img_hidden() returns text[]
language sql stable security definer set search_path = public as
$$ select coalesce(array_agg(url), '{}') from public.image_checks where status in ('flagged','appealed','rejected') $$;
grant execute on function public.img_hidden() to anon, authenticated;

-- mis imágenes marcadas (para el aviso de la autoría)
create or replace function public.img_mine() returns setof public.image_checks
language sql stable security definer set search_path = public as
$$ select * from public.image_checks where owner = auth.uid() order by created_at desc limit 100 $$;
grant execute on function public.img_mine() to authenticated;

-- pedir revisión humana ("es un error")
create or replace function public.img_appeal(p_url text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.image_checks; nm text;
begin
  select * into r from public.image_checks where url = p_url and owner = auth.uid();
  if not found then raise exception 'No encontramos esa imagen'; end if;
  if r.severity = 'hard' then raise exception 'Esta imagen no se puede apelar'; end if;
  if r.status <> 'flagged' then raise exception 'Esta imagen ya fue enviada a revisión o resuelta'; end if;
  update public.image_checks set status = 'appealed', note = left(btrim(coalesce(p_note, '')), 300), appealed_at = now() where url = p_url;
end $$;
grant execute on function public.img_appeal(text, text) to authenticated;

-- cola del equipo: apeladas + las rechazadas por gravedad que nadie ha mirado
create or replace function public.img_queue() returns table (url text, owner uuid, owner_name text, kind text, story_id text, status text, severity text, reasons jsonb, note text, created_at timestamptz, appealed_at timestamptz, reason text, handled_by uuid, handled_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query
    select c.url, c.owner, p.name, c.kind, c.story_id, c.status, c.severity, c.reasons, c.note, c.created_at, c.appealed_at, c.reason, c.handled_by, c.handled_at
    from public.image_checks c join public.profiles p on p.id = c.owner
    where public.in_scope(c.community)
      and (c.status = 'appealed' or (c.severity = 'hard' and c.handled_at is null) or (c.handled_at is not null and c.handled_at > now() - interval '14 days'))
    order by (c.status = 'appealed') desc, coalesce(c.appealed_at, c.created_at) desc limit 200;
end $$;
grant execute on function public.img_queue() to authenticated;

-- aprobar o rechazar
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
    insert into public.notifications (user_id, type, extra, href) values (r.owner, 'sys', 'Tu imagen fue revisada y aprobada: ya se ve para todos.', '#/images');
    perform public.log_action('img-approve', r.owner::text, left(p_url, 120));
  else
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo del rechazo'; end if;
    update public.image_checks set status = 'rejected', reason = left(btrim(p_reason), 300), handled_by = auth.uid(), handled_at = now() where url = p_url;
    insert into public.notifications (user_id, type, extra, xv, href) values (r.owner, 'sys', 'Tu imagen fue revisada y rechazada: {n}', jsonb_build_object('n', left(btrim(p_reason), 300)), '#/images');
    perform public.log_action('img-reject', r.owner::text, left(btrim(p_reason), 100));
  end if;
end $$;
grant execute on function public.img_decide(text, boolean, text) to authenticated;
