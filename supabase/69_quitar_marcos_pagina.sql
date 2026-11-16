-- Auri · se descartan los marcos de pagina (puntitos, corazones, rosas)
delete from public.pass_rewards where item in ($q$pf:puntitos$q$, $q$pf:corazones$q$, $q$pf:rosas$q$);
