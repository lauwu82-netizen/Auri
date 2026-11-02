-- =====================================================================
-- AURI · Estilos de chat (etapa 9): paquetes que la Owner puede regalar
-- Ejecutar DESPUÉS de 32_visitas.sql, en una consulta nueva del SQL Editor.
--
-- Cada cuenta guarda los paquetes que tiene en profiles.skins (por ejemplo {kawaii}).
-- Por ahora solo la Owner los regala y los quita (para probarlos con tu equipo de prueba); la tienda y el pase vendrán después.
-- =====================================================================
alter table public.profiles add column if not exists skins text[] not null default '{}';

-- nadie se da paquetes a sí mismo: "skins" también lo protege guard_profile
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('auri.bypass', true) = '1' or public.is_owner() then return new; end if;
  if new.role is distinct from old.role or new.scope is distinct from old.scope
     or new.frame_top is distinct from old.frame_top or new.mod_since is distinct from old.mod_since
     or new.adm_since is distinct from old.adm_since or new.bows is distinct from old.bows
     or new.skins is distinct from old.skins
     or new.id is distinct from old.id then
    raise exception 'No tienes permiso para cambiar eso';
  end if;
  return new;
end $$;

create or replace function public.skin_name(p text) returns text language sql immutable as
$$ select case p when 'kawaii' then 'Kawaii' when 'retro' then 'Retro 2000' when 'victoriano' then 'Victoriano' when 'antiguo' then 'Antiguo'
                 when 'futurista' then 'Futurista' when 'sanvalentin' then 'San Valentín' when 'misterio' then 'Misterio nocturno' end $$;

create or replace function public.skin_gift(to_id uuid, pack text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text; n int;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede regalar'; end if;
  nm := public.skin_name(pack); if nm is null then raise exception 'Ese paquete no existe'; end if;
  if to_id = auth.uid() or (select role from public.profiles where id = to_id) = 'OWNER' then raise exception 'Ese paquete es para otras cuentas'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set skins = array_append(array_remove(skins, pack), pack) where id = to_id;
  get diagnostics n = row_count;
  perform set_config('auri.bypass', '0', true);
  if n = 0 then raise exception 'No encontré esa cuenta'; end if;
  insert into public.notifications (user_id, type, extra, xv)
    values (to_id, 'sys', '¡Te regalaron un estilo de chat ({n})! Actívalo en Ajustes › Estilo de chat.', jsonb_build_object('n', nm));
  perform public.log_action('skin-gift', to_id::text, 'Estilo de chat regalado · ' || nm);
end $$;

create or replace function public.skin_take(to_id uuid, pack text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede quitar paquetes'; end if;
  nm := public.skin_name(pack); if nm is null then raise exception 'Ese paquete no existe'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set skins = array_remove(skins, pack) where id = to_id;
  perform set_config('auri.bypass', '0', true);
  insert into public.notifications (user_id, type, extra, xv)
    values (to_id, 'sys', 'Se retiró un estilo de chat de tu cuenta ({n}).', jsonb_build_object('n', nm));
  perform public.log_action('skin-take', to_id::text, 'Estilo de chat retirado · ' || nm);
end $$;

revoke all on function public.skin_gift(uuid, text), public.skin_take(uuid, text) from public, anon;
grant execute on function public.skin_gift(uuid, text), public.skin_take(uuid, text) to authenticated;
