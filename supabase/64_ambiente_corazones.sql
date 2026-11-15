-- Auri · pase de lector nivel 13: ambiente de lectura "Corazones flotantes" (reemplaza las gemas moradas de ese nivel)
delete from public.pass_rewards where track = $q$reader$q$ and tier = $q$paid$q$ and level = 13;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$paid$q$,13,$q$item$q$,$q$amb:hearts$q$,0,$q$amb:hearts$q$);
