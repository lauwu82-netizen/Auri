-- Auri · pase GRATIS de ESCRITOR, nivel 14: skin de herramientas "Estuche de tinta" (fskin:estuchetinta). Repetible.
-- Solo cambia la recompensa del nivel 14 del pase gratis de escritor. No toca pass_claims ni profiles (items/titles):
-- lo ya obtenido se conserva. No cambia triggers ni validaciones.
begin;

-- Seguridad: si ese nivel tiene algo distinto de sep:carta (o ya el nuevo premio), se aborta sin cambiar nada.
do $$
begin
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 14 and item not in ($q$sep:carta$q$, $q$fskin:estuchetinta$q$)) then
    raise exception $q$writer/free/14 tiene premios inesperados; no se cambio nada$q$;
  end if;
end $$;

delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 14 and item in ($q$sep:carta$q$, $q$fskin:estuchetinta$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$free$q$, 14, $q$item$q$, $q$fskin:estuchetinta$q$, 0, $q$fskin:estuchetinta$q$);

commit;

select level, kind, item, key from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 14;
