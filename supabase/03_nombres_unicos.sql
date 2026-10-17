-- Auri · nombres de usuario únicos (sin importar mayúsculas ni espacios de más)
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor → Run.

-- 1) función que usa la app para avisar "ese usuario ya está en uso" antes de crear la cuenta
create or replace function public.name_taken(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(n, '\s+', ' ', 'g')))
      and p.id is distinct from auth.uid())
$$;
revoke all on function public.name_taken(text) from public;
grant execute on function public.name_taken(text) to anon, authenticated;

-- 2) la base de datos también lo exige (por si alguien se salta la app)
do $$
begin
  create unique index if not exists profiles_name_unique
    on public.profiles (lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));
exception when others then
  raise notice 'Hay usuarios con el mismo nombre; cámbialos y vuelve a ejecutar este archivo. Detalle: %', sqlerrm;
end $$;
