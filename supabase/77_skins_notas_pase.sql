-- Auri · pase gratis de escritor: skins de notas (nivel 1 Querido corazon, nivel 12 Cartas prohibidas)
-- Repetible. Solo toca esos dos niveles del pase gratis de escritor. Reclamar usa pass_claim (kind item -> profiles.items).
delete from public.pass_rewards
where track = $q$writer$q$ and tier = $q$free$q$ and level in (1, 12) and kind = $q$purple$q$;
delete from public.pass_rewards
where track = $q$writer$q$ and tier = $q$free$q$ and item in ($q$nskin:querido-corazon$q$, $q$nskin:cartas-prohibidas$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$writer$q$, $q$free$q$, 1, $q$item$q$, $q$nskin:querido-corazon$q$, 0, $q$nskin:querido-corazon$q$),
($q$writer$q$, $q$free$q$, 12, $q$item$q$, $q$nskin:cartas-prohibidas$q$, 0, $q$nskin:cartas-prohibidas$q$);
