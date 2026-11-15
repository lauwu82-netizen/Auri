-- Auri · herramienta de pruebas (NO es una migracion; se corre cuando haga falta)
-- Deja a una cuenta con los dos pases comprados y en nivel 20, sin reclamar nada.
-- Cambia NOMBRE por el @usuario de la cuenta de prueba (sin la arroba).
do $$
declare u uuid; s text;
begin
  select id into u from public.profiles where lower(username) = lower($q$NOMBRE$q$);
  if u is null then raise exception $q$No existe esa cuenta$q$; end if;
  select id into s from public.pass_seasons where current_date between starts and ends order by starts desc limit 1;
  if s is null then raise exception $q$No hay temporada activa$q$; end if;
  insert into public.pass_owned (uid, season, track) values (u, s, $q$reader$q$), (u, s, $q$writer$q$) on conflict do nothing;
  insert into public.mission_claims (uid, mission_id, period, season, xp)
    select u, (select id from public.missions where track = $q$reader$q$ and kind = $q$season$q$ limit 1), $q$test-boost$q$, s, 7000
    on conflict do nothing;
  insert into public.mission_claims (uid, mission_id, period, season, xp)
    select u, (select id from public.missions where track = $q$writer$q$ and kind = $q$season$q$ limit 1), $q$test-boost$q$, s, 7000
    on conflict do nothing;
end $$;
