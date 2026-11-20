-- Pase GRATIS de LECTOR: niveles 3, 5 y 16 (San Valentín). Repetible.
delete from public.pass_rewards where track = $q$reader$q$ and tier = $q$free$q$ and level in (3, 5, 16);
delete from public.pass_rewards where track = $q$reader$q$ and tier = $q$free$q$ and item in ($q$head:enamorados$q$, $q$sep:petalosunidos$q$, $q$fin:concarino$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$, $q$free$q$, 3, $q$item$q$, $q$head:enamorados$q$, 0, $q$head:enamorados$q$),
($q$reader$q$, $q$free$q$, 5, $q$item$q$, $q$sep:petalosunidos$q$, 0, $q$sep:petalosunidos$q$),
($q$reader$q$, $q$free$q$, 16, $q$item$q$, $q$fin:concarino$q$, 0, $q$fin:concarino$q$);
select level, kind, item from public.pass_rewards where track = $q$reader$q$ and tier = $q$free$q$ and level in (3, 5, 16) order by level;
