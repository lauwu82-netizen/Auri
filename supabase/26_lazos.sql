-- 26 · Lazos regalables: la Owner regala lazos (sin límite ni vencimiento) y los puede quitar.
-- Cada cuenta guarda los lazos que tiene en profiles.bows; el que lleva puesto sigue en profiles.cos_top ('bow:pink', etc.).
-- Los marcos del equipo (A de owner/administración/moderación) NO se regalan.

alter table public.profiles add column if not exists bows text[] not null default '{}';

-- nadie se regala lazos a sí mismo: se suma "bows" a lo que protege guard_profile
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('auri.bypass', true) = '1' or public.is_owner() then return new; end if;
  if new.role is distinct from old.role or new.scope is distinct from old.scope
     or new.frame_top is distinct from old.frame_top or new.mod_since is distinct from old.mod_since
     or new.adm_since is distinct from old.adm_since or new.bows is distinct from old.bows
     or new.id is distinct from old.id then
    raise exception 'No tienes permiso para cambiar eso';
  end if;
  return new;
end $$;

create or replace function public.bow_gift(to_id uuid, bow text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text; n int;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede regalar'; end if;
  nm := case bow when 'white' then 'Blanco' when 'pink' then 'Rosa' when 'blue' then 'Azul claro' when 'red' then 'Rojo'
                 when 'purple' then 'Morado' when 'yellow' then 'Amarillo' when 'green' then 'Verde' end;
  if nm is null then raise exception 'Ese lazo no existe'; end if;
  if to_id = auth.uid() or (select role from public.profiles where id = to_id) = 'OWNER' then raise exception 'Ese lazo es para otras cuentas'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set bows = array_append(array_remove(bows, bow), bow) where id = to_id;
  get diagnostics n = row_count;
  perform set_config('auri.bypass', '0', true);
  if n = 0 then raise exception 'No encontré esa cuenta'; end if;
  insert into public.notifications (user_id, type, extra, xv)
    values (to_id, 'sys', '¡Te regalaron un lazo ({n})! Puedes ponértelo en Insignias y adornos.', jsonb_build_object('n', nm));
  perform public.log_action('bow-gift', to_id::text, 'Lazo regalado · ' || nm);
end $$;

create or replace function public.bow_take(to_id uuid, bow text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede quitar lazos'; end if;
  nm := case bow when 'white' then 'Blanco' when 'pink' then 'Rosa' when 'blue' then 'Azul claro' when 'red' then 'Rojo'
                 when 'purple' then 'Morado' when 'yellow' then 'Amarillo' when 'green' then 'Verde' end;
  if nm is null then raise exception 'Ese lazo no existe'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set bows = array_remove(bows, bow),
         cos_top = case when cos_top = 'bow:' || bow then '' else cos_top end
   where id = to_id;
  perform set_config('auri.bypass', '0', true);
  insert into public.notifications (user_id, type, extra, xv)
    values (to_id, 'sys', 'Se retiró un lazo de tu perfil ({n}).', jsonb_build_object('n', nm));
  perform public.log_action('bow-take', to_id::text, 'Lazo retirado · ' || nm);
end $$;

revoke all on function public.bow_gift(uuid, text), public.bow_take(uuid, text) from public, anon;
grant execute on function public.bow_gift(uuid, text), public.bow_take(uuid, text) to authenticated;
