-- =====================================================================
-- AURI · Sin notificaciones al equipo por reportes, apelaciones y publicaciones por aprobar
-- Ejecutar DESPUÉS de 09_comentarios_capitulo.sql, en una consulta nueva del SQL Editor.
-- Lo pendiente ahora se ve con el contador rojo en Moderación (no llena la bandeja de notificaciones).
-- Los avisos a la persona afectada (strike, apelación aceptada o rechazada, regalos, invitaciones) siguen igual.
-- =====================================================================

-- Avisos al equipo por reportes, apelaciones y solicitudes de quitar +18: ya no se envían
create or replace function public.notify_staff(comm text, p_type text, p_extra text, p_xv jsonb, p_href text, p_only_admin boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  return;
end $$;

-- Avisos de publicaciones (noticias y tarjetas del banner) por aprobar: ya no se envían
create or replace function public.post_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  return new;
end $$;

-- Limpieza: borra los avisos de ese tipo que ya estaban en las bandejas del equipo
delete from public.notifications
where type = 'sys' and href like '#/moderation/%' and href <> '#/moderation/gifts';
