-- Auri · pase gratis de lector: barra de progreso Hilo rojo (nivel 7) y marcapaginas Lacito de carta (nivel 12)
-- Repetible. Solo toca esos dos niveles del pase gratis de lector. Reclamar usa pass_claim (kind item -> profiles.items).
delete from public.pass_rewards
where track = $q$reader$q$ and tier = $q$free$q$ and level in (7, 12) and kind = $q$purple$q$;
delete from public.pass_rewards
where track = $q$reader$q$ and tier = $q$free$q$ and item in ($q$prog:hilorojo$q$, $q$rib:lacitocarta$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$, $q$free$q$, 7, $q$item$q$, $q$prog:hilorojo$q$, 0, $q$prog:hilorojo$q$),
($q$reader$q$, $q$free$q$, 12, $q$item$q$, $q$rib:lacitocarta$q$, 0, $q$rib:lacitocarta$q$);
