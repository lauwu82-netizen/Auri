-- Tienda de cosmeticos: catalogo con precios en AuriCoins, ofertas y compra
-- Las ofertas se cambian editando offer_price (vacio = sin oferta). La app muestra maximo 5.

create table if not exists public.shop_items (
  sku text primary key,
  cat text not null,
  price int not null check (price >= 100),
  offer_price int check (offer_price is null or (offer_price >= 100 and offer_price < price)),
  grants text[] not null,
  active boolean not null default true,
  sort int not null default 0
);
alter table public.shop_items enable row level security;
drop policy if exists shop_items_read on public.shop_items;
create policy shop_items_read on public.shop_items for select to authenticated using (active);

insert into public.shop_items (sku, cat, price, offer_price, grants, sort) values
  ($q$pack:coquette1$q$, $q$coquette$q$, 300, 225, array[$q$cq:flores$q$, $q$cq:mariposas$q$, $q$cq:joya$q$], 1),
  ($q$pack:coquette2$q$, $q$coquette$q$, 300, null, array[$q$cq:corazones$q$, $q$cq:vichy$q$, $q$cq:perlas$q$], 2),
  ($q$cq:flores$q$, $q$coquette$q$, 120, null, array[$q$cq:flores$q$], 3),
  ($q$cq:mariposas$q$, $q$coquette$q$, 120, null, array[$q$cq:mariposas$q$], 4),
  ($q$cq:joya$q$, $q$coquette$q$, 120, null, array[$q$cq:joya$q$], 5),
  ($q$cq:corazones$q$, $q$coquette$q$, 120, null, array[$q$cq:corazones$q$], 6),
  ($q$cq:vichy$q$, $q$coquette$q$, 120, null, array[$q$cq:vichy$q$], 7),
  ($q$cq:perlas$q$, $q$coquette$q$, 120, null, array[$q$cq:perlas$q$], 8),
  ($q$skin:kawaii$q$, $q$skins$q$, 300, 225, array[$q$skin:kawaii$q$], 1),
  ($q$skin:retro$q$, $q$skins$q$, 300, null, array[$q$skin:retro$q$], 2),
  ($q$skin:victoriano$q$, $q$skins$q$, 300, 240, array[$q$skin:victoriano$q$], 3),
  ($q$skin:futurista$q$, $q$skins$q$, 300, null, array[$q$skin:futurista$q$], 4),
  ($q$skin:antiguo$q$, $q$skins$q$, 300, null, array[$q$skin:antiguo$q$], 5),
  ($q$skin:misterio$q$, $q$skins$q$, 300, null, array[$q$skin:misterio$q$], 6),
  ($q$bow:white$q$, $q$lazos$q$, 100, null, array[$q$bow:white$q$], 1),
  ($q$bow:pink$q$, $q$lazos$q$, 100, null, array[$q$bow:pink$q$], 2),
  ($q$bow:blue$q$, $q$lazos$q$, 100, null, array[$q$bow:blue$q$], 3),
  ($q$bow:red$q$, $q$lazos$q$, 100, null, array[$q$bow:red$q$], 4),
  ($q$bow:purple$q$, $q$lazos$q$, 100, null, array[$q$bow:purple$q$], 5),
  ($q$bow:yellow$q$, $q$lazos$q$, 100, null, array[$q$bow:yellow$q$], 6),
  ($q$bow:green$q$, $q$lazos$q$, 100, null, array[$q$bow:green$q$], 7),
  ($q$shape:cat$q$, $q$formas$q$, 150, null, array[$q$shape:cat$q$], 1),
  ($q$shape:heart$q$, $q$formas$q$, 150, 120, array[$q$shape:heart$q$], 2),
  ($q$shape:star$q$, $q$formas$q$, 150, null, array[$q$shape:star$q$], 3),
  ($q$shape:flower$q$, $q$formas$q$, 150, null, array[$q$shape:flower$q$], 4),
  ($q$shape:cloud$q$, $q$formas$q$, 150, null, array[$q$shape:cloud$q$], 5),
  ($q$halo:pink$q$, $q$bordes$q$, 100, null, array[$q$halo:pink$q$], 1),
  ($q$halo:blue$q$, $q$bordes$q$, 100, null, array[$q$halo:blue$q$], 2),
  ($q$halo:purple$q$, $q$bordes$q$, 100, null, array[$q$halo:purple$q$], 3),
  ($q$halo:mint$q$, $q$bordes$q$, 100, null, array[$q$halo:mint$q$], 4),
  ($q$halo:yellow$q$, $q$bordes$q$, 100, null, array[$q$halo:yellow$q$], 5),
  ($q$halo:peach$q$, $q$bordes$q$, 100, null, array[$q$halo:peach$q$], 6),
  ($q$halo:white$q$, $q$bordes$q$, 100, null, array[$q$halo:white$q$], 7),
  ($q$halo:red$q$, $q$bordes$q$, 100, null, array[$q$halo:red$q$], 8),
  ($q$pet:gato$q$, $q$mascotas$q$, 250, null, array[$q$pet:gato$q$], 1),
  ($q$pet:perro$q$, $q$mascotas$q$, 250, null, array[$q$pet:perro$q$], 2),
  ($q$pet:conejo$q$, $q$mascotas$q$, 250, 200, array[$q$pet:conejo$q$], 3),
  ($q$pet:pinguino$q$, $q$mascotas$q$, 250, null, array[$q$pet:pinguino$q$], 4)
on conflict (sku) do nothing;

create or replace function public.shop_buy(p_sku text) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare me uuid := auth.uid(); it public.shop_items; cost int; have text[]; n int;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  select * into it from public.shop_items where sku = p_sku and active;
  if not found then raise exception $q$Ese cosmetico no esta disponible$q$; end if;
  select items into have from public.profiles where id = me for update;
  if it.grants <@ coalesce(have, array[]::text[]) then raise exception $q$Ya lo tienes$q$; end if;
  cost := coalesce(it.offer_price, it.price);
  update public.wallets set coins = coins - cost, updated_at = now() where uid = me and coins >= cost;
  get diagnostics n = row_count;
  if n = 0 then raise exception $q$No tienes suficientes AuriCoins$q$; end if;
  insert into public.coin_ledger (uid, delta, reason, ref) values (me, -cost, $q$tienda$q$, it.sku);
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = (select coalesce(array_agg(distinct x), array[]::text[]) from unnest(coalesce(items, array[]::text[]) || it.grants) as x) where id = me;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true, $q$cost$q$, cost);
end $fn$;
revoke all on function public.shop_buy(text) from public, anon;
grant execute on function public.shop_buy(text) to authenticated;
