-- =====================================================================
-- AURI · Etapa 5: noticias y banners
-- Ejecutar DESPUÉS de 05_moderacion.sql, en una consulta nueva del SQL Editor.
-- (Las tablas, permisos y guardas de noticias ya existen desde 01_schema.sql; aquí solo se agregan los avisos a quien aprueba.)
-- =====================================================================

-- Cuando Moderación envía una publicación (o la vuelve a enviar), la Owner y Administración de esa comunidad reciben el aviso.
create or replace function public.post_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and new.title is not distinct from old.title and new.text is not distinct from old.text then return new; end if;
  if tg_table_name = 'news' then
    if new.type = 'Evento' then return new; end if;            -- los eventos avisan por su tarjeta del banner
    what := 'Nuevo anuncio por aprobar: {t}';
  else
    what := 'Nueva tarjeta del banner por aprobar';
  end if;
  insert into public.notifications (user_id, type, from_user, extra, xv, href)
  select p.id, 'sys', null, what, jsonb_build_object('t', left(coalesce(new.title, ''), 50)), '#/moderation/posts'
  from public.profiles p
  where p.id is distinct from auth.uid()
    and (p.role = 'OWNER' or (p.role = 'ADMIN' and (new.comm = 'all' or new.comm = any (coalesce(p.scope, '{}'::text[])))));
  return new;
end $$;
drop trigger if exists trg_post_notify_news on public.news;
create trigger trg_post_notify_news after insert or update on public.news for each row execute function public.post_notify();
drop trigger if exists trg_post_notify_banner on public.banners;
create trigger trg_post_notify_banner after insert or update on public.banners for each row execute function public.post_notify();

-- Las noticias y tarjetas aprobadas se pueden leer sin cuenta (modo invitado)
grant select on public.news, public.banners to anon;
