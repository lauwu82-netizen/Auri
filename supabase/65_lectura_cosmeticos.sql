-- Auri · pase: letras capitales, cintas de marcapaginas y tarjeta de fin de capitulo; el pase gratis deja de repartir tantas gemas moradas
-- Pase de lector de paga: nivel 7 letra capital rosa con espinas, 10 cinta de seda, 16 tarjeta de fin de capitulo, 19 letra capital tinta y corazon
delete from public.pass_rewards where track = $q$reader$q$ and tier = $q$paid$q$ and level in (7, 10, 16, 19);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$paid$q$,7,$q$item$q$,$q$dc:rosa$q$,0,$q$dc:rosa$q$),
($q$reader$q$,$q$paid$q$,10,$q$item$q$,$q$rib:seda$q$,0,$q$rib:seda$q$),
($q$reader$q$,$q$paid$q$,16,$q$item$q$,$q$fin:carta$q$,0,$q$fin:carta$q$),
($q$reader$q$,$q$paid$q$,19,$q$item$q$,$q$dc:tinta$q$,0,$q$dc:tinta$q$);
-- Pase gratis: se quitan las gemas moradas sobrantes (quedan solo los niveles 10 y 19)
delete from public.pass_rewards where tier = $q$free$q$ and kind = $q$purple$q$ and level not in (10, 19);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$free$q$,3,$q$item$q$,$q$dc:encaje$q$,0,$q$dc:encaje$q$),
($q$reader$q$,$q$free$q$,9,$q$item$q$,$q$rib:llave$q$,0,$q$rib:llave$q$),
($q$reader$q$,$q$free$q$,13,$q$item$q$,$q$rib:corazon$q$,0,$q$rib:corazon$q$);
