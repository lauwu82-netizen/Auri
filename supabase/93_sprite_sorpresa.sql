-- Sprite sorpresa: una emocion al azar (que aun no tienes) por 100 AuriCoins
-- Usa el sorteo que ya existe (60% comun, 25% poco comun, 12% epico, 3% legendario; nunca repite).
create or replace function public.sprite_gacha() returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare me uuid := auth.uid(); have text[]; k text; cost int := 100; n int;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  select items into have from public.profiles where id = me for update;
  k := public._sprite_roll(coalesce(have, array[]::text[]));
  if k is null then raise exception $q$Ya tienes todos los sprites$q$; end if;
  update public.wallets set coins = coins - cost, updated_at = now() where uid = me and coins >= cost;
  get diagnostics n = row_count;
  if n = 0 then raise exception $q$No tienes suficientes AuriCoins$q$; end if;
  insert into public.coin_ledger (uid, delta, reason, ref) values (me, -cost, $q$sprite_sorpresa$q$, k);
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = array_append(coalesce(items, array[]::text[]), $q$sprite:$q$ || k) where id = me;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true, $q$key$q$, k);
end $fn$;
revoke all on function public.sprite_gacha() from public, anon;
grant execute on function public.sprite_gacha() to authenticated;
