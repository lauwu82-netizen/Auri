-- Auri · pase etapa 2: objetos (formas, mascotas, separadores, adornos, fondos y colores de chat)
alter table public.profiles add column if not exists items text[] not null default array[]::text[];
alter table public.pass_rewards drop constraint if exists pass_rewards_kind_check;
alter table public.pass_rewards add constraint pass_rewards_kind_check check (kind in ($q$cyan$q$, $q$purple$q$, $q$coins$q$, $q$title$q$, $q$item$q$));
delete from public.pass_rewards where kind = $q$item$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$paid$q$,1,$q$item$q$,$q$shape:wings$q$,0,$q$shape:wings$q$),
($q$reader$q$,$q$paid$q$,2,$q$item$q$,$q$skin:sanvalentin$q$,0,$q$skin:sanvalentin$q$),
($q$reader$q$,$q$paid$q$,3,$q$item$q$,$q$sep:flecha$q$,0,$q$sep:flecha$q$),
($q$reader$q$,$q$paid$q$,5,$q$item$q$,$q$cq:bombones$q$,0,$q$cq:bombones$q$),
($q$reader$q$,$q$paid$q$,6,$q$item$q$,$q$cq:enamorado$q$,0,$q$cq:enamorado$q$),
($q$reader$q$,$q$paid$q$,8,$q$item$q$,$q$hue:red$q$,0,$q$hue:red$q$),
($q$reader$q$,$q$paid$q$,9,$q$item$q$,$q$rbg:sanvalentin$q$,0,$q$rbg:sanvalentin$q$),
($q$reader$q$,$q$paid$q$,11,$q$item$q$,$q$cq:encaje$q$,0,$q$cq:encaje$q$),
($q$reader$q$,$q$paid$q$,12,$q$item$q$,$q$pet:cupida$q$,0,$q$pet:cupida$q$),
($q$reader$q$,$q$paid$q$,14,$q$item$q$,$q$hue:lilac$q$,0,$q$hue:lilac$q$),
($q$reader$q$,$q$paid$q$,17,$q$item$q$,$q$pet:cupido$q$,0,$q$pet:cupido$q$),
($q$reader$q$,$q$free$q$,14,$q$item$q$,$q$sep:carta$q$,0,$q$sep:carta$q$),
($q$writer$q$,$q$paid$q$,3,$q$item$q$,$q$shape:broken$q$,0,$q$shape:broken$q$),
($q$writer$q$,$q$paid$q$,8,$q$item$q$,$q$ebg:sanvalentin$q$,0,$q$ebg:sanvalentin$q$),
($q$writer$q$,$q$paid$q$,14,$q$item$q$,$q$pet:diablillo$q$,0,$q$pet:diablillo$q$);

-- reclama todo lo disponible de un nivel (gratis o de paga)
create or replace function public.pass_claim(p_track text, p_tier text, p_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.pass_seasons; today date := (now() at time zone $q$utc$q$)::date; st jsonb; r public.pass_rewards; ins int; n int := 0;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  if p_track not in ($q$reader$q$, $q$writer$q$) or p_tier not in ($q$free$q$, $q$paid$q$) then raise exception $q$Premio no valido$q$; end if;
  select * into s from public.pass_seasons where today between starts and ends order by starts desc limit 1;
  if not found then raise exception $q$No hay una temporada activa$q$; end if;
  st := public.mission_state(p_track);
  if coalesce((st ->> $q$level$q$)::int, 1) < p_level then raise exception $q$Todavia no llegas a ese nivel$q$; end if;
  if p_tier = $q$paid$q$ and not coalesce((st ->> $q$owned$q$)::boolean, false) then raise exception $q$Necesitas el pase para reclamar esto$q$; end if;
  perform public._wallet_ensure(me);
  for r in select * from public.pass_rewards where track = p_track and tier = p_tier and level = p_level order by item loop
    insert into public.pass_claims (uid, season, track, tier, level, item) values (me, s.id, p_track, p_tier, p_level, r.item) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins = 0 then continue; end if;
    n := n + 1;
    if r.kind = $q$cyan$q$ then
      update public.wallets set cyan = cyan + r.amount, updated_at = now() where uid = me;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, $q$cyan$q$, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$purple$q$ then
      update public.wallets set purple = purple + r.amount, updated_at = now() where uid = me;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, $q$purple$q$, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$coins$q$ then
      update public.wallets set coins = coins + r.amount, updated_at = now() where uid = me;
      insert into public.coin_ledger (uid, delta, reason, ref) values (me, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$item$q$ then
      perform set_config($q$auri.bypass$q$, $q$1$q$, true);
      update public.profiles set items = array_append(items, r.key) where id = me and not (r.key = any(items));
      perform set_config($q$auri.bypass$q$, $q$0$q$, true);
    elsif r.kind = $q$title$q$ then
      perform set_config($q$auri.bypass$q$, $q$1$q$, true);
      update public.profiles set titles = array_append(titles, r.key) where id = me and not (r.key = any(titles));
      perform set_config($q$auri.bypass$q$, $q$0$q$, true);
    end if;
  end loop;
  if n = 0 then raise exception $q$Ya reclamaste este premio$q$; end if;
  return jsonb_build_object($q$ok$q$, true, $q$n$q$, n);
end $$;
revoke all on function public.pass_claim(text, text, int) from public, anon;
grant execute on function public.pass_claim(text, text, int) to authenticated;

-- nadie se cambia por su cuenta el gatito, el titulo de fundador, los titulos de pase ni los pases
create or replace function public.guard_pet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting($q$auri.bypass$q$, true) = $q$1$q$ or public.is_owner() then return new; end if;
  if new.pet_f is distinct from old.pet_f or new.ftitle is distinct from old.ftitle or new.titles is distinct from old.titles or new.items is distinct from old.items or new.pass_r is distinct from old.pass_r or new.pass_w is distinct from old.pass_w then
    raise exception $q$No tienes permiso para cambiar eso$q$;
  end if;
  if new.pet like $q$fundador-%$q$ and new.pet is distinct from old.pet and new.pet is distinct from new.pet_f then
    raise exception $q$Ese gatito es exclusivo del Top 50$q$;
  end if;
  return new;
end $$;
