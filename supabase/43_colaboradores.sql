-- 43 · Cuentas colaboradoras (eventos de colaboración con creadores).
-- La Owner activa o quita el permiso desde el menú de Administración del perfil de cada cuenta.
-- Una cuenta colaboradora puede, en el modo novela visual: subir sus personajes oficiales (aunque sean canon) y otras imágenes
-- propias (sprites, fondos) sin la revisión automática de IA. Su novela SÍ cobra gemas a quienes la leen y los CGs SIEMPRE los hace la IA
-- (llevan al OC de quien lee). (Cada permiso se activa conforme existe la función; la marca ya queda guardada.)

alter table public.profiles add column if not exists collab boolean not null default false;

-- nadie se da a sí mismo el permiso: se suma "collab" a lo que protege guard_profile
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('auri.bypass', true) = '1' or public.is_owner() then return new; end if;
  if new.role is distinct from old.role or new.scope is distinct from old.scope
     or new.frame_top is distinct from old.frame_top or new.mod_since is distinct from old.mod_since
     or new.adm_since is distinct from old.adm_since or new.bows is distinct from old.bows
     or new.skins is distinct from old.skins or new.collab is distinct from old.collab
     or new.id is distinct from old.id then
    raise exception 'No tienes permiso para cambiar eso';
  end if;
  return new;
end $$;

create or replace function public.collab_set(to_id uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede hacer esto'; end if;
  if to_id = auth.uid() or (select role from public.profiles where id = to_id) = 'OWNER' then raise exception 'Ese permiso es para otras cuentas'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set collab = on_ where id = to_id;
  get diagnostics n = row_count;
  perform set_config('auri.bypass', '0', true);
  if n = 0 then raise exception 'No encontré esa cuenta'; end if;
  insert into public.notifications (user_id, type, extra)
    values (to_id, 'sys', case when on_ then 'Ahora eres colaboradora de Auri: puedes subir tus propias imágenes en el modo novela visual.' else 'Se retiró tu permiso de colaboración.' end);
  perform public.log_action('collab-set', to_id::text, case when on_ then 'Activó colaboración' else 'Quitó colaboración' end);
end $$;

revoke all on function public.collab_set(uuid, boolean) from public, anon;
grant execute on function public.collab_set(uuid, boolean) to authenticated;
