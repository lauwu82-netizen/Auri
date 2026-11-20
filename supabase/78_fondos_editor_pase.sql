-- Auri · pase gratis de escritor: fondos del editor (nivel 5 Tinta calida, nivel 16 Rosa ceniza)
-- Repetible. Solo toca esos dos niveles del pase gratis de escritor. Reclamar usa pass_claim (kind item -> profiles.items).
delete from public.pass_rewards
where track = $q$writer$q$ and tier = $q$free$q$ and level in (5, 16) and kind = $q$purple$q$;
delete from public.pass_rewards
where track = $q$writer$q$ and tier = $q$free$q$ and item in ($q$ebg:tintacalida$q$, $q$ebg:rosaceniza$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$writer$q$, $q$free$q$, 5, $q$item$q$, $q$ebg:tintacalida$q$, 0, $q$ebg:tintacalida$q$),
($q$writer$q$, $q$free$q$, 16, $q$item$q$, $q$ebg:rosaceniza$q$, 0, $q$ebg:rosaceniza$q$);
