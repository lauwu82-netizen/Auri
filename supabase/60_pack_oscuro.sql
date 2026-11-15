-- Auri · pack San Valentin oscuro (pase de escritor, nivel 13): corona de rosas, corazon y collar
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 13 and kind = $q$item$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$writer$q$,$q$paid$q$,13,$q$item$q$,$q$cq:rosas$q$,0,$q$cq:rosas$q$),
($q$writer$q$,$q$paid$q$,13,$q$item$q$,$q$cq:corazondark$q$,0,$q$cq:corazondark$q$),
($q$writer$q$,$q$paid$q$,13,$q$item$q$,$q$cq:collardark$q$,0,$q$cq:collardark$q$);
