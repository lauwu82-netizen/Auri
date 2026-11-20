-- Auri · pase gratis de lector: fondos de lectura (nivel 1 Papel de rosa, nivel 11 Noche de algodon)
-- Repetible. Solo toca esos dos niveles del pase gratis de lector. Reclamar usa pass_claim (kind item -> profiles.items).
delete from public.pass_rewards
where track = $q$reader$q$ and tier = $q$free$q$ and level in (1, 11) and kind = $q$purple$q$;
delete from public.pass_rewards
where track = $q$reader$q$ and tier = $q$free$q$ and item in ($q$rbg:papelrosa$q$, $q$rbg:nochealgodon$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$, $q$free$q$, 1, $q$item$q$, $q$rbg:papelrosa$q$, 0, $q$rbg:papelrosa$q$),
($q$reader$q$, $q$free$q$, 11, $q$item$q$, $q$rbg:nochealgodon$q$, 0, $q$rbg:nochealgodon$q$);
