-- =====================================================================
-- AURI · Fotos y fondos dentro de los chats (etapa 7 del modo chat)
-- Ejecutar DESPUÉS de 30_modo_chat.sql, en una consulta nueva del SQL Editor.
--
-- Cómo funciona:
--  · Las fotos de un chat se suben a Storage igual que las demás y la Edge Function "moderate-image" las revisa.
--  · Libro SIN +18 (lo leen también menores): regla muy estricta. Libro +18: regla más flexible (lo muy grave se rechaza igual).
--  · Una foto de chat solo se muestra cuando la IA la anotó como limpia; mientras tanto el lector ve «Revisando la foto…».
--  · Si la IA la marca, se oculta para todos y la autoría puede pedir revisión humana (igual que las portadas).
-- =====================================================================

-- registrar una foto limpia (la IA la aprobó). Si ya estaba aprobada por la IA, se actualiza (por ejemplo, el libro dejó de ser +18)
create or replace function public.img_clear(p_owner uuid, p_url text, p_story text, p_mature boolean)
returns text language plpgsql security definer set search_path = public as $$
declare comm text;
begin
  select community into comm from public.profiles where id = p_owner; if comm is null then return 'missing'; end if;
  insert into public.image_checks (url, owner, community, kind, story_id, status, severity, reasons)
  values (p_url, p_owner, comm, 'chat', coalesce(p_story, ''), 'approved', 'soft', jsonb_build_object('clean', true, 'chat', true, 'mature', coalesce(p_mature, false)))
  on conflict (url) do update set reasons = excluded.reasons
    where public.image_checks.status = 'approved' and public.image_checks.handled_by is null;
  return 'ok';
end $$;
revoke all on function public.img_clear(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.img_clear(uuid, text, text, boolean) to service_role;

-- si una foto ya estaba "aprobada por la IA" y ahora se marca (regla más estricta), se actualiza el registro
create or replace function public.img_report(p_owner uuid, p_url text, p_kind text, p_story text, p_severity text, p_reasons jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare comm text; st text;
begin
  if p_severity not in ('soft','hard') then raise exception 'severidad inválida'; end if;
  select community into comm from public.profiles where id = p_owner; if comm is null then return 'missing'; end if;
  st := case when p_severity = 'hard' then 'rejected' else 'flagged' end;
  insert into public.image_checks (url, owner, community, kind, story_id, status, severity, reasons)
  values (p_url, p_owner, comm, coalesce(p_kind, 'other'), coalesce(p_story, ''), st, p_severity, p_reasons)
  on conflict (url) do update set status = excluded.status, severity = excluded.severity, reasons = excluded.reasons, created_at = now()
    where public.image_checks.status = 'approved' and public.image_checks.handled_by is null;
  if found then
    insert into public.notifications (user_id, type, extra, href)
    values (p_owner, 'sys', case when p_severity = 'hard' then 'Una de tus imágenes no cumple las reglas de Auri y se ocultó.' else 'Una de tus imágenes fue marcada automáticamente y se ocultó. Si crees que fue un error, puedes pedir una revisión.' end, '#/images');
  end if;
  return st;
end $$;
revoke all on function public.img_report(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.img_report(uuid, text, text, text, text, jsonb) to service_role;

-- el lector pregunta por el estado de las fotos de un chat (solo devuelve estado, nunca motivos ni dueños)
create or replace function public.img_state(p_urls text[]) returns table (url text, status text)
language sql stable security definer set search_path = public as
$$ select c.url, c.status from public.image_checks c where c.url = any(p_urls[1:40]) $$;
grant execute on function public.img_state(text[]) to anon, authenticated;
