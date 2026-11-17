-- Regalo de fundador: insignia + paquete de chat Retro 2000, solo durante unos 3 meses desde el lanzamiento
create table if not exists public.founder_window (
  id int primary key default 1 check (id = 1),
  starts date not null,
  ends date not null
);
insert into public.founder_window (id, starts, ends) values (1, $q$2027-01-25$q$::date, $q$2027-05-05$q$::date) on conflict (id) do nothing;
alter table public.founder_window enable row level security;
drop policy if exists founder_window_read on public.founder_window;
create policy founder_window_read on public.founder_window for select to authenticated using (true);

create or replace function public.founder_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.founder_window;
begin
  select * into w from public.founder_window where id = 1;
  if not found then return $q${"open": false}$q$::jsonb; end if;
  return jsonb_build_object($q$open$q$, current_date between w.starts and w.ends, $q$ends$q$, w.ends);
end $$;

create or replace function public.founder_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w public.founder_window; has boolean;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  select * into w from public.founder_window where id = 1;
  if not found or current_date < w.starts then raise exception $q$El regalo de fundador todavia no esta disponible$q$; end if;
  if current_date > w.ends then raise exception $q$El regalo de fundador ya termino$q$; end if;
  select $q$badge:fundador$q$ = any(items) into has from public.profiles where id = me;
  if coalesce(has, false) then raise exception $q$Ya reclamaste este regalo$q$; end if;
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = (select array_agg(distinct x) from unnest(items || array[$q$badge:fundador$q$, $q$skin:retro$q$]) x) where id = me;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true);
end $$;

revoke all on function public.founder_status() from public, anon;
revoke all on function public.founder_claim() from public, anon;
grant execute on function public.founder_status() to authenticated;
grant execute on function public.founder_claim() to authenticated;
