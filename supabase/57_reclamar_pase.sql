-- Auri · reclamar recompensas del pase (etapa 1: gemas moradas, monedas y titulos)
-- Las gemas se guardan en cuartos (12 = 3 gemas). En el pase de paga se alternan gemas cian y moradas.
alter table public.profiles add column if not exists titles text[] not null default array[]::text[];

create table if not exists public.pass_rewards (
  track text not null check (track in ($q$reader$q$, $q$writer$q$)),
  tier text not null check (tier in ($q$free$q$, $q$paid$q$)),
  level int not null check (level between 1 and 20),
  kind text not null,
  item text not null,
  amount int not null default 0,
  key text,
  primary key (track, tier, level, item)
);
alter table public.pass_rewards drop constraint if exists pass_rewards_kind_check;
alter table public.pass_rewards add constraint pass_rewards_kind_check check (kind in ($q$cyan$q$, $q$purple$q$, $q$coins$q$, $q$title$q$));
alter table public.pass_rewards enable row level security;
drop policy if exists pr_sel on public.pass_rewards;
create policy pr_sel on public.pass_rewards for select to authenticated using (true);
revoke insert, update, delete on public.pass_rewards from anon, authenticated;
delete from public.pass_rewards;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$free$q$,10,$q$purple$q$,$q$purple:12$q$,12,null),
($q$reader$q$,$q$free$q$,19,$q$purple$q$,$q$purple:12$q$,12,null),
($q$writer$q$,$q$free$q$,10,$q$purple$q$,$q$purple:12$q$,12,null),
($q$writer$q$,$q$free$q$,19,$q$purple$q$,$q$purple:12$q$,12,null),
($q$reader$q$,$q$paid$q$,4,$q$cyan$q$,$q$cyan:40$q$,40,null),
($q$reader$q$,$q$paid$q$,7,$q$purple$q$,$q$purple:40$q$,40,null),
($q$reader$q$,$q$paid$q$,10,$q$cyan$q$,$q$cyan:60$q$,60,null),
($q$reader$q$,$q$paid$q$,13,$q$purple$q$,$q$purple:60$q$,60,null),
($q$reader$q$,$q$paid$q$,16,$q$cyan$q$,$q$cyan:80$q$,80,null),
($q$reader$q$,$q$paid$q$,19,$q$purple$q$,$q$purple:80$q$,80,null),
($q$reader$q$,$q$paid$q$,20,$q$title$q$,$q$title:corazon$q$,0,$q$corazon$q$),
($q$writer$q$,$q$paid$q$,1,$q$title$q$,$q$title:tinta$q$,0,$q$tinta$q$),
($q$writer$q$,$q$paid$q$,2,$q$coins$q$,$q$coins:50$q$,50,null),
($q$writer$q$,$q$paid$q$,6,$q$coins$q$,$q$coins:50$q$,50,null),
($q$writer$q$,$q$paid$q$,12,$q$coins$q$,$q$coins:75$q$,75,null),
($q$writer$q$,$q$paid$q$,20,$q$coins$q$,$q$coins:175$q$,175,null),
($q$writer$q$,$q$paid$q$,4,$q$cyan$q$,$q$cyan:40$q$,40,null),
($q$writer$q$,$q$paid$q$,9,$q$purple$q$,$q$purple:40$q$,40,null),
($q$writer$q$,$q$paid$q$,15,$q$cyan$q$,$q$cyan:60$q$,60,null),
($q$writer$q$,$q$paid$q$,19,$q$purple$q$,$q$purple:60$q$,60,null),
($q$writer$q$,$q$paid$q$,20,$q$title$q$,$q$title:rompe$q$,0,$q$rompe$q$);

create table if not exists public.pass_claims (
  uid uuid not null references public.profiles(id) on delete cascade,
  season text not null references public.pass_seasons(id) on delete cascade,
  track text not null,
  tier text not null,
  level int not null,
  item text not null,
  claimed_at timestamptz not null default now(),
  primary key (uid, season, track, tier, level, item)
);
alter table public.pass_claims enable row level security;
drop policy if exists pc_sel on public.pass_claims;
create policy pc_sel on public.pass_claims for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.pass_claims from anon, authenticated;

-- premios del pase de esta temporada, con cuales ya reclamaste
create or replace function public.pass_state(p_track text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.pass_seasons; today date := (now() at time zone $q$utc$q$)::date; out jsonb;
begin
  if me is null then return null; end if;
  select * into s from public.pass_seasons where today between starts and ends order by starts desc limit 1;
  if not found then return $q$[]$q$::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object($q$tier$q$, r.tier, $q$level$q$, r.level, $q$item$q$, r.item, $q$kind$q$, r.kind, $q$amount$q$, r.amount, $q$key$q$, r.key, $q$claimed$q$, c.item is not null)), $q$[]$q$::jsonb)
    into out from public.pass_rewards r
    left join public.pass_claims c on c.uid = me and c.season = s.id and c.track = r.track and c.tier = r.tier and c.level = r.level and c.item = r.item
    where r.track = p_track;
  return out;
end $$;
revoke all on function public.pass_state(text) from public, anon;
grant execute on function public.pass_state(text) to authenticated;

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
  if new.pet_f is distinct from old.pet_f or new.ftitle is distinct from old.ftitle or new.titles is distinct from old.titles or new.pass_r is distinct from old.pass_r or new.pass_w is distinct from old.pass_w then
    raise exception $q$No tienes permiso para cambiar eso$q$;
  end if;
  if new.pet like $q$fundador-%$q$ and new.pet is distinct from old.pet and new.pet is distinct from new.pet_f then
    raise exception $q$Ese gatito es exclusivo del Top 50$q$;
  end if;
  return new;
end $$;
