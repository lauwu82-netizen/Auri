-- Pase de lector (paga): niveles 7 y 19 dan 200 AuriCoins cada uno
delete from public.pass_rewards where track = $q$reader$q$ and tier = $q$paid$q$ and level in (7, 19);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$paid$q$,7,$q$coins$q$,$q$coins:200$q$,200,null),
($q$reader$q$,$q$paid$q$,19,$q$coins$q$,$q$coins:200$q$,200,null);
