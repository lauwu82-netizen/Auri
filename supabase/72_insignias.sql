-- Insignias de temporada (San Valentin): pase gratis, niveles 4, 8, 17 y 20
delete from public.pass_rewards where tier = $q$free$q$ and level in (4, 8, 17, 20);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$free$q$,4,$q$item$q$,$q$badge:firstblush$q$,0,$q$badge:firstblush$q$),
($q$reader$q$,$q$free$q$,8,$q$item$q$,$q$badge:loveletter$q$,0,$q$badge:loveletter$q$),
($q$reader$q$,$q$free$q$,17,$q$item$q$,$q$badge:eternalbloom$q$,0,$q$badge:eternalbloom$q$),
($q$reader$q$,$q$free$q$,20,$q$item$q$,$q$badge:everafter$q$,0,$q$badge:everafter$q$),
($q$writer$q$,$q$free$q$,4,$q$item$q$,$q$badge:forbiddenpact$q$,0,$q$badge:forbiddenpact$q$),
($q$writer$q$,$q$free$q$,8,$q$item$q$,$q$badge:crimsonelixir$q$,0,$q$badge:crimsonelixir$q$),
($q$writer$q$,$q$free$q$,17,$q$item$q$,$q$badge:crimsonmuse$q$,0,$q$badge:crimsonmuse$q$),
($q$writer$q$,$q$free$q$,20,$q$item$q$,$q$badge:devilsmasterpiece$q$,0,$q$badge:devilsmasterpiece$q$);
