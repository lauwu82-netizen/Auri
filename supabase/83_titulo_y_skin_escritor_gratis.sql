-- Auri · pase GRATIS de ESCRITOR: nivel 7 titulo "Cartas sin destino" y nivel 13 skin de capitulos "Indice de cartas". Repetible.
-- No toca pass_claims ni profiles (items/titles): lo ya obtenido se conserva.
begin;

-- Seguridad: si hay premios inesperados en esos niveles, se aborta sin cambiar nada.
do $$
begin
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 7 and item not in ($q$title:cartasdestino$q$)) then
    raise exception $q$writer/free/7 tiene premios inesperados; no se cambio nada$q$;
  end if;
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 13 and kind <> $q$purple$q$ and item not in ($q$cskin:indicecartas$q$)) then
    raise exception $q$writer/free/13 tiene premios inesperados; no se cambio nada$q$;
  end if;
end $$;

-- Nivel 7: titulo (kind title, la clave es el nombre sin prefijo, como los otros titulos)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 7 and item = $q$title:cartasdestino$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$free$q$, 7, $q$title$q$, $q$title:cartasdestino$q$, 0, $q$cartasdestino$q$);

-- Nivel 13: skin (sale solo el relleno de gemas moradas)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 13 and (kind = $q$purple$q$ or item = $q$cskin:indicecartas$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$free$q$, 13, $q$item$q$, $q$cskin:indicecartas$q$, 0, $q$cskin:indicecartas$q$);

commit;

select level, kind, item, key from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level in (7, 13) order by level;
