-- Auri · gatitos fundadores del Top 50 (sin comillas simples, para que el iPhone no las cambie)
-- Puesto 1 = gatito morado, 2 = azul, 3 = rosa; del 4 al 50 sale uno al azar al reclamar el regalo.

alter table public.profiles add column if not exists pet_f text;
alter table public.gifts add column if not exists place int;

-- al reclamar el regalo se asigna el gatito; si se retira el marco, se retira el gatito
create or replace function public.gift_pet_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare names text[] := array[$q$blanco$q$, $q$negro$q$, $q$calico$q$, $q$marron$q$, $q$gris$q$, $q$siames$q$]; k text;
begin
  if new.status = $q$claimed$q$ and old.status is distinct from $q$claimed$q$ then
    k := case new.place when 1 then $q$morado$q$ when 2 then $q$azul$q$ when 3 then $q$rosa$q$ else names[1 + floor(random() * 6)::int] end;
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet = $q$fundador-$q$ || k, pet_f = $q$fundador-$q$ || k where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  elsif new.status = $q$revoked$q$ and old.status = $q$claimed$q$ then
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet_f = null, pet = case when pet like $q$fundador-%$q$ then null else pet end where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  end if;
  return new;
end $$;
drop trigger if exists trg_gift_pet on public.gifts;
create trigger trg_gift_pet after update on public.gifts for each row execute function public.gift_pet_assign();

-- nadie se pone un gatito fundador por su cuenta (solo el que el servidor le asignó)
create or replace function public.guard_pet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting($q$auri.bypass$q$, true) = $q$1$q$ or public.is_owner() then return new; end if;
  if new.pet_f is distinct from old.pet_f then raise exception $q$No tienes permiso para cambiar eso$q$; end if;
  if new.pet like $q$fundador-%$q$ and new.pet is distinct from old.pet and new.pet is distinct from new.pet_f then
    raise exception $q$Ese gatito es exclusivo del Top 50$q$;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_pet on public.profiles;
create trigger trg_guard_pet before update on public.profiles for each row execute function public.guard_pet();

-- regalar el marco eligiendo el puesto (1, 2 o 3; vacío = del 4 al 50)
create or replace function public.gift_send_place(to_id uuid, p int) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not public.is_owner() then raise exception $q$Solo la Owner puede regalar$q$; end if;
  if p is not null and (p < 1 or p > 3) then raise exception $q$Puesto no válido$q$; end if;
  perform public.gifts_sweep();
  if p is not null and exists (select 1 from public.gifts where place = p and status in ($q$pending$q$, $q$claimed$q$)) then
    raise exception $q$Ese puesto ya se regaló$q$;
  end if;
  gid := public.gift_send(to_id);
  update public.gifts set place = p where id = gid;
  return gid;
end $$;
revoke all on function public.gift_send_place(uuid, int) from public, anon;
grant execute on function public.gift_send_place(uuid, int) to authenticated;
