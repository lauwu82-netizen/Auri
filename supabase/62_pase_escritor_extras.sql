-- Auri · pase de escritor: separador rosas y espinas (nivel 7), fondos del editor dulce + oscuro (nivel 8) y fondo de lectura oscuro (nivel 16)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level in (7, 16) and kind = $q$item$q$;
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 8 and key = $q$ebg:sanvalentindark$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$writer$q$,$q$paid$q$,7,$q$item$q$,$q$sep:espinas$q$,0,$q$sep:espinas$q$),
($q$writer$q$,$q$paid$q$,8,$q$item$q$,$q$ebg:sanvalentindark$q$,0,$q$ebg:sanvalentindark$q$),
($q$writer$q$,$q$paid$q$,16,$q$item$q$,$q$rbg:sanvalentindark$q$,0,$q$rbg:sanvalentindark$q$);
