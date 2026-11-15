-- Auri · herramienta de pruebas: deja la cuenta de prueba como nueva (sin pases, sin nivel, sin premios reclamados).
-- Solo para cuentas de PRUEBA: borra sus premios, objetos y titulos del pase.
-- Cambia NOMBRE por el @usuario (sin la arroba).
do $$
declare u uuid;
begin
  select id into u from public.profiles where lower(username) = lower($q$NOMBRE$q$);
  if u is null then raise exception $q$No existe esa cuenta$q$; end if;
  delete from public.pass_claims where uid = u;
  delete from public.pass_owned where uid = u;
  delete from public.mission_claims where uid = u and period = $q$test-boost$q$;
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = $q${}$q$, titles = $q${}$q$ where id = u;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
end $$;
