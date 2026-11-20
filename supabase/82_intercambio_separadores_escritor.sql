-- Auri · pase de escritor: Promesa de tinta (paga, nivel 7) y Rosas y espinas (gratis, nivel 9). Repetible.
-- No borra pass_claims ni profiles.items: quien ya reclamo algo lo conserva.
begin;

-- Seguridad: si hay premios inesperados en esos niveles, se aborta sin cambiar nada.
do $$
begin
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 7 and item not in ($q$sep:espinas$q$, $q$sep:promesatinta$q$)) then
    raise exception $q$writer/paid/7 tiene premios inesperados; no se cambio nada$q$;
  end if;
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 9 and kind <> $q$purple$q$ and item not in ($q$sep:espinas$q$, $q$sep:promesatinta$q$)) then
    raise exception $q$writer/free/9 tiene premios inesperados; no se cambio nada$q$;
  end if;
end $$;

-- Paga nivel 7: Promesa de tinta (sale Rosas y espinas)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 7 and item in ($q$sep:espinas$q$, $q$sep:promesatinta$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$paid$q$, 7, $q$item$q$, $q$sep:promesatinta$q$, 0, $q$sep:promesatinta$q$);

-- Gratis nivel 9: Rosas y espinas (sale solo el relleno de gemas moradas y cualquier Promesa de tinta puesta por error)
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$free$q$ and level = 9 and (kind = $q$purple$q$ or item in ($q$sep:espinas$q$, $q$sep:promesatinta$q$));
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$free$q$, 9, $q$item$q$, $q$sep:espinas$q$, 0, $q$sep:espinas$q$);

commit;

select tier, level, kind, item from public.pass_rewards where track = $q$writer$q$ and ((tier = $q$paid$q$ and level = 7) or (tier = $q$free$q$ and level = 9)) order by tier, level;
