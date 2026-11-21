-- Auri · pase de PAGA de ESCRITOR, nivel 17: skin de lista de capitulos "Cartas de amor". Repetible.
-- No toca pass_claims ni profiles: lo ya obtenido se conserva.
begin;

-- Seguridad: si el nivel 17 de paga tiene premios inesperados, se aborta sin cambiar nada.
do $$
begin
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 17 and kind <> $q$purple$q$ and item <> $q$cskin:cartasamor$q$) then
    raise exception $q$writer/paid/17 tiene premios inesperados; no se cambio nada$q$;
  end if;
end $$;

delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 17 and (kind = $q$purple$q$ or item = $q$cskin:cartasamor$q$);
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$paid$q$, 17, $q$item$q$, $q$cskin:cartasamor$q$, 0, $q$cskin:cartasamor$q$);

commit;

select level, kind, item, key from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 17;
