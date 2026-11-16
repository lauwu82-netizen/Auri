-- Auri · pase de escritor: marcos de portada (nivel 5 sweet love, nivel 10 dark San Valentin)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level in (5, 10) and kind = $q$item$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$writer$q$,$q$paid$q$,5,$q$item$q$,$q$cf:sweet$q$,0,$q$cf:sweet$q$),
($q$writer$q$,$q$paid$q$,10,$q$item$q$,$q$cf:dark$q$,0,$q$cf:dark$q$);
