-- Auri · nombre de usuario único (@usuario) + nombre para mostrar repetible
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor → Run.

alter table public.profiles add column if not exists username text;

-- 1) cuentas que ya existen: su usuario sale de su nombre actual (solo a-z, 0-9, _ y .), sin repetirse
do $$
declare r record; base text; cand text; n int;
begin
  for r in select id, name from public.profiles where username is null order by created_at loop
    base := regexp_replace(lower(translate(coalesce(r.name,''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9_.]+', '', 'g');
    if length(base) < 3 then base := 'usuario' || base; end if;
    base := left(base, 16); cand := base; n := 1;
    while exists (select 1 from public.profiles where username = cand) loop
      n := n + 1; cand := left(base, 16) || n::text;
    end loop;
    update public.profiles set username = cand where id = r.id;
  end loop;
end $$;

-- 2) el usuario es único (sin importar mayúsculas); el nombre para mostrar YA NO
drop index if exists public.profiles_name_unique;
create unique index if not exists profiles_username_unique on public.profiles (lower(username));
do $$ begin
  alter table public.profiles add constraint profiles_username_fmt check (username is null or username ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;

-- 3) la app pregunta si un usuario está libre
create or replace function public.username_taken(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where lower(p.username) = lower(btrim(u)) and p.id is distinct from auth.uid())
$$;
revoke all on function public.username_taken(text) from public;
grant execute on function public.username_taken(text) to anon, authenticated;

-- 4) cuentas nuevas: guardan el usuario que eligieron
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); un text := lower(btrim(coalesce(m->>'username','')));
begin
  if un !~ '^[a-z0-9_.]{3,20}$' then un := null; end if;
  insert into public.profiles (id, name, username, community, terms_accepted)
  values (new.id, left(coalesce(nullif(m->>'name',''), split_part(new.email,'@',1)), 40), un,
          case when m->>'community' = 'en' then 'en' else 'es' end, current_date);
  insert into public.profile_private (id, email, birth, gender, interests, onboarded)
  values (new.id, new.email,
          nullif(m->>'birth','')::date, m->>'gender',
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(m->'interests','[]'::jsonb)) x), '{}'),
          true);
  return new;
end $$;
