-- =====================================================================
-- AURI · Peso de los reportes según quién reporta
-- Ejecutar DESPUÉS de 38_misiones_pases.sql, en una consulta nueva del SQL Editor.
--
-- Idea: no todos los reportes pesan igual. Cada reporte guarda un "peso" de 0 a 100 que el
-- SERVIDOR calcula en el momento de reportar (nadie lo puede escribir desde la app):
--   · Antigüedad de la cuenta   hasta 40 puntos (llega al máximo a los 90 días)
--   · Actividad real            hasta 40 puntos (días distintos con lecturas o comentarios en los últimos 30; máximo con 12 días)
--   · Historial de reportes     hasta 20 puntos (reportes que el equipo resolvió vs descartó; sin historial = 10)
--   · Cada strike vigente resta 15 puntos
--   · Equipo (moderación, administración, Owner): 100
--   · Cuenta con menos de 3 días o con menos de 2 días activos: peso 0 ("sin peso", queda al final de la cola)
--   · Pasados 5 reportes en un mismo día el peso de los siguientes es 0 (evita reportar en masa)
-- El peso solo sirve para ORDENAR y priorizar: ningún reporte se borra ni se ignora.
-- =====================================================================

alter table public.reports add column if not exists weight int not null default 0 check (weight between 0 and 100);

create or replace function public.reporter_weight(p_uid uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; age_d numeric; act int; r int; d int; w numeric; st int;
begin
  select * into p from public.profiles where id = p_uid;
  if not found then return 0; end if;
  if p.role in ('MODERATOR','ADMIN','OWNER') then return 100; end if;
  age_d := extract(epoch from (now() - p.created_at)) / 86400;
  select count(*) into act from (
    select v.day as x from public.story_views v where v.viewer = p_uid and v.day > current_date - 30
    union
    select c.created_at::date from public.comments c where c.user_id = p_uid and c.created_at > now() - interval '30 days'
  ) q;
  if age_d < 3 or act < 2 then return 0; end if;
  select count(*) filter (where status = 'resolved'), count(*) filter (where status = 'dismissed') into r, d
    from public.reports where "by" = p_uid and type not in ('problem','reclass');
  select count(*) into st from public.strikes where user_id = p_uid and not void;
  w := least(40, age_d / 90 * 40) + least(40, act / 12.0 * 40) + case when r + d < 3 then 10 else 20.0 * r / (r + d) end - 15 * st;
  return greatest(0, least(100, round(w)))::int;
end $$;
revoke all on function public.reporter_weight(uuid) from public, anon, authenticated;

create or replace function public.report_weight_set() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where "by" = new."by" and created_at > now() - interval '1 day') >= 5 then new.weight := 0;
  else new.weight := public.reporter_weight(new."by"); end if;
  return new;
end $$;
drop trigger if exists trg_report_weight on public.reports;
create trigger trg_report_weight before insert on public.reports for each row execute function public.report_weight_set();   -- corre después de trg_report_defaults (orden alfabético)

-- nadie cambia el peso a mano
create or replace function public.report_weight_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.weight := old.weight; return new; end $$;
drop trigger if exists trg_report_weight_guard on public.reports;
create trigger trg_report_weight_guard before update on public.reports for each row execute function public.report_weight_guard();

-- reportes que ya existían: se calculan una vez con los datos de hoy
update public.reports set weight = public.reporter_weight("by");

-- Reportes de imágenes: llegan a la cola con 3 reportes, pero ahora cuentan solo cuentas con peso mayor a 0
-- (o, si el equipo reporta, cuenta de inmediato).
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
  select count(*) into n from public.image_reports r where r.url = p_url and public.reporter_weight(r.reporter) > 0;
  if n >= 3 then
    insert into public.image_checks (url, owner, community, kind, story_id, status, severity, source, note)
    values (p_url, own, coalesce(comm, 'es'), coalesce(nullif(p_kind, ''), 'other'), coalesce(p_story, ''), 'reported', 'soft', 'users', 'Reportada por ' || n || ' cuentas')
    on conflict (url) do nothing;
  end if;
  return n;
end $$;
grant execute on function public.img_user_report(text, text, text, text[], text) to authenticated;
