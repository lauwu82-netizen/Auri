-- Auri · título "Fundador/a de Auri" del Top 50 (sin comillas simples)
-- Guarda m = Fundador, f = Fundadora, n = Fundador/a según el género que la persona eligió al registrarse (el género sigue siendo privado).

alter table public.profiles add column if not exists ftitle text;

create or replace function public.gift_pet_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare names text[] := array[$q$blanco$q$, $q$negro$q$, $q$calico$q$, $q$marron$q$, $q$gris$q$, $q$siames$q$]; k text; g text; tt text;
begin
  if new.status = $q$claimed$q$ and old.status is distinct from $q$claimed$q$ then
    k := case new.place when 1 then $q$morado$q$ when 2 then $q$azul$q$ when 3 then $q$rosa$q$ else names[1 + floor(random() * 6)::int] end;
    select gender into g from public.profile_private where id = new.to_user;
    tt := case g when $q$Hombre$q$ then $q$m$q$ when $q$Mujer$q$ then $q$f$q$ else $q$n$q$ end;
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet = $q$fundador-$q$ || k, pet_f = $q$fundador-$q$ || k, ftitle = tt where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  elsif new.status = $q$revoked$q$ and old.status = $q$claimed$q$ then
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet_f = null, ftitle = null, pet = case when pet like $q$fundador-%$q$ then null else pet end where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  end if;
  return new;
end $$;

create or replace function public.guard_pet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting($q$auri.bypass$q$, true) = $q$1$q$ or public.is_owner() then return new; end if;
  if new.pet_f is distinct from old.pet_f or new.ftitle is distinct from old.ftitle then raise exception $q$No tienes permiso para cambiar eso$q$; end if;
  if new.pet like $q$fundador-%$q$ and new.pet is distinct from old.pet and new.pet is distinct from new.pet_f then
    raise exception $q$Ese gatito es exclusivo del Top 50$q$;
  end if;
  return new;
end $$;

-- quienes ya tenían el marco reciben su título
update public.profiles p set ftitle = case q.gender when $q$Hombre$q$ then $q$m$q$ when $q$Mujer$q$ then $q$f$q$ else $q$n$q$ end
from public.profile_private q where q.id = p.id and p.frame_top and p.ftitle is null;
