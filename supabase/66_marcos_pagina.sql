-- Auri · se descartan letra capital decorada y llavecita; entran marcos de pagina y barra de progreso con corazon
delete from public.pass_rewards where item in ($q$dc:rosa$q$, $q$dc:tinta$q$, $q$dc:encaje$q$, $q$rib:llave$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$paid$q$,7,$q$item$q$,$q$pf:rosas$q$,0,$q$pf:rosas$q$),
($q$reader$q$,$q$paid$q$,19,$q$item$q$,$q$pf:corazones$q$,0,$q$pf:corazones$q$),
($q$reader$q$,$q$free$q$,3,$q$item$q$,$q$pf:puntitos$q$,0,$q$pf:puntitos$q$),
($q$reader$q$,$q$free$q$,9,$q$item$q$,$q$prog:corazon$q$,0,$q$prog:corazon$q$);
