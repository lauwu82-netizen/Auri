-- Auri (version 2, reemplaza a la 60: tambien abre la tienda a esa cuenta) · la Owner puede dejar a cualquier cuenta con los dos pases y nivel 20 (sin reclamar), o reiniciarla
create or replace function public.owner_pass_test(to_id uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s text; k text;
begin
  if not public.is_owner() then raise exception $q$Solo la Owner$q$; end if;
  select id into s from public.pass_seasons where current_date between starts and ends order by starts desc limit 1;
  if s is null then raise exception $q$No hay temporada activa$q$; end if;
  if on_ then
    insert into public.pass_owned (uid, season, track) values (to_id, s, $q$reader$q$), (to_id, s, $q$writer$q$) on conflict do nothing;
    for k in select unnest(array[$q$reader$q$, $q$writer$q$]) loop
      insert into public.mission_claims (uid, mission_id, period, season, xp)
        select to_id, (select id from public.missions where track = k and kind = $q$season$q$ limit 1), $q$test-boost$q$, s, 7000
        on conflict do nothing;
    end loop;
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set items = array_append(coalesce(items, array[]::text[]), $q$tester:store$q$) where id = to_id and not ($q$tester:store$q$ = any(coalesce(items, array[]::text[])));
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  else
    delete from public.pass_claims where uid = to_id;
    delete from public.pass_owned where uid = to_id;
    delete from public.mission_claims where uid = to_id and period = $q$test-boost$q$;
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set
      items = coalesce((select array_agg(x) from unnest(items) x where x not in (select key from public.pass_rewards where kind = $q$item$q$) and x not like $q$sprite:%$q$ and x <> $q$tester:store$q$), array[]::text[]),
      titles = coalesce((select array_agg(x) from unnest(titles) x where x not in (select key from public.pass_rewards where kind = $q$title$q$)), array[]::text[])
    where id = to_id;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  end if;
end $$;
revoke all on function public.owner_pass_test(uuid, boolean) from public, anon;
grant execute on function public.owner_pass_test(uuid, boolean) to authenticated;
