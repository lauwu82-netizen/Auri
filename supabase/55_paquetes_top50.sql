-- Auri · paquetes de regalo del Top 50 (sin comillas simples)
-- Puesto: 1, 2, 3, 10 (= del 4 al 10) o 50 (= del 11 al 50). Nivel: 0 = pocas personas, 1 = participación normal, 2 = mucha gente.
-- Gemas moradas (solo puestos 1-3): 600 / 300 / 150 (a 6 gemas por capítulo = 100 / 50 / 25 capítulos).
-- AuriCoins: nivel 1 = 200 a todos; nivel 2 = 500 (puestos 1-3), 300 (4-10), 200 (11-50). Nivel 2 + puestos 1-3 = cupones de pase de lector y de escritor (90 días para canjear, cada pase dura 30 días).

alter table public.wallets add column if not exists coins int not null default 0 check (coins >= 0);
alter table public.gifts add column if not exists level int;
alter table public.profiles add column if not exists pass_r timestamptz;
alter table public.profiles add column if not exists pass_w timestamptz;

create table if not exists public.coin_ledger (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta <> 0),
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
alter table public.coin_ledger enable row level security;
drop policy if exists cl_own on public.coin_ledger;
create policy cl_own on public.coin_ledger for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.coin_ledger from anon, authenticated;

create table if not exists public.pass_vouchers (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ($q$reader$q$, $q$writer$q$)),
  source text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
create index if not exists pv_uid on public.pass_vouchers (uid, redeemed_at);
alter table public.pass_vouchers enable row level security;
drop policy if exists pv_own on public.pass_vouchers;
create policy pv_own on public.pass_vouchers for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.pass_vouchers from anon, authenticated;

-- la billetera ahora también muestra monedas, cupones y pases activos
create or replace function public.my_wallet() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w public.wallets; n int; s int; pr timestamptz; pw timestamptz;
begin
  if me is null then return null; end if;
  perform public._reward_sweep(); perform public._wallet_ensure(me);
  select * into w from public.wallets where uid = me;
  select count(*), coalesce(sum(amount), 0) into n, s from public.rewards where to_uid = me and claimed_at is null and returned_at is null and (expires_at is null or expires_at > now());
  select pass_r, pass_w into pr, pw from public.profiles where id = me;
  return jsonb_build_object($q$cyan$q$, w.cyan, $q$purple$q$, w.purple, $q$pending$q$, n, $q$pending_q$q$, s, $q$coins$q$, w.coins,
    $q$pass_r$q$, case when pr > now() then pr else null end, $q$pass_w$q$, case when pw > now() then pw else null end,
    $q$vouchers$q$, coalesce((select jsonb_agg(jsonb_build_object($q$id$q$, v.id, $q$kind$q$, v.kind, $q$expires$q$, v.expires_at) order by v.created_at)
      from public.pass_vouchers v where v.uid = me and v.redeemed_at is null and v.expires_at > now()), $q$[]$q$::jsonb));
end $$;

-- canjear un cupón: activa 30 días de pase desde hoy (si ya tenía pase, se suman al final)
create or replace function public.voucher_redeem(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v public.pass_vouchers;
begin
  if me is null then raise exception $q$Inicia sesión$q$; end if;
  select * into v from public.pass_vouchers where id = p_id and uid = me for update;
  if not found then raise exception $q$Ese cupón no existe$q$; end if;
  if v.redeemed_at is not null then raise exception $q$Ese cupón ya se canjeó$q$; end if;
  if v.expires_at < now() then raise exception $q$Ese cupón venció$q$; end if;
  update public.pass_vouchers set redeemed_at = now() where id = v.id;
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  if v.kind = $q$reader$q$ then
    update public.profiles set pass_r = greatest(coalesce(pass_r, now()), now()) + interval $q$30 days$q$ where id = me;
  else
    update public.profiles set pass_w = greatest(coalesce(pass_w, now()), now()) + interval $q$30 days$q$ where id = me;
  end if;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true, $q$kind$q$, v.kind);
end $$;
revoke all on function public.voucher_redeem(uuid) from public, anon;
grant execute on function public.voucher_redeem(uuid) to authenticated;

-- al reclamar el marco: gatito, título, gemas, monedas y cupones según puesto y nivel
create or replace function public.gift_pet_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare names text[] := array[$q$blanco$q$, $q$negro$q$, $q$calico$q$, $q$marron$q$, $q$gris$q$, $q$siames$q$]; k text; g text; tt text; pl int; lv int; gq int; cn int;
begin
  if new.status = $q$claimed$q$ and old.status is distinct from $q$claimed$q$ then
    pl := coalesce(new.place, 50); lv := coalesce(new.level, 0);
    k := case pl when 1 then $q$morado$q$ when 2 then $q$azul$q$ when 3 then $q$rosa$q$ else names[1 + floor(random() * 6)::int] end;
    select gender into g from public.profile_private where id = new.to_user;
    tt := case g when $q$Hombre$q$ then $q$m$q$ when $q$Mujer$q$ then $q$f$q$ else $q$n$q$ end;
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet = $q$fundador-$q$ || k, pet_f = $q$fundador-$q$ || k, ftitle = tt where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
    perform public._wallet_ensure(new.to_user);
    gq := case pl when 1 then 2400 when 2 then 1200 when 3 then 600 else 0 end;
    cn := case lv when 1 then 200 when 2 then (case when pl <= 3 then 500 when pl = 10 then 300 else 200 end) else 0 end;
    if gq > 0 then
      update public.wallets set purple = purple + gq, updated_at = now() where uid = new.to_user;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (new.to_user, $q$purple$q$, gq, $q$premio Top 50$q$, $q$gift:$q$ || new.id);
    end if;
    if cn > 0 then
      update public.wallets set coins = coins + cn, updated_at = now() where uid = new.to_user;
      insert into public.coin_ledger (uid, delta, reason, ref) values (new.to_user, cn, $q$premio Top 50$q$, $q$gift:$q$ || new.id);
    end if;
    if lv = 2 and pl <= 3 then
      insert into public.pass_vouchers (uid, kind, source, expires_at) values
        (new.to_user, $q$reader$q$, $q$top50$q$, now() + interval $q$90 days$q$),
        (new.to_user, $q$writer$q$, $q$top50$q$, now() + interval $q$90 days$q$);
    end if;
  elsif new.status = $q$revoked$q$ and old.status = $q$claimed$q$ then
    perform set_config($q$auri.bypass$q$, $q$1$q$, true);
    update public.profiles set pet_f = null, ftitle = null, pet = case when pet like $q$fundador-%$q$ then null else pet end where id = new.to_user;
    perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  end if;
  return new;
end $$;

-- nadie se cambia el gatito, el título ni los pases por su cuenta
create or replace function public.guard_pet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting($q$auri.bypass$q$, true) = $q$1$q$ or public.is_owner() then return new; end if;
  if new.pet_f is distinct from old.pet_f or new.ftitle is distinct from old.ftitle or new.pass_r is distinct from old.pass_r or new.pass_w is distinct from old.pass_w then
    raise exception $q$No tienes permiso para cambiar eso$q$;
  end if;
  if new.pet like $q$fundador-%$q$ and new.pet is distinct from old.pet and new.pet is distinct from new.pet_f then
    raise exception $q$Ese gatito es exclusivo del Top 50$q$;
  end if;
  return new;
end $$;

-- regalar el marco eligiendo puesto (1, 2, 3, 10 o 50) y nivel (0, 1 o 2)
drop function if exists public.gift_send_place(uuid, int);
create or replace function public.gift_send_place(to_id uuid, p int, lvl int default 1) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not public.is_owner() then raise exception $q$Solo la Owner puede regalar$q$; end if;
  if p is null or p not in (1, 2, 3, 10, 50) then raise exception $q$Puesto no válido$q$; end if;
  if lvl is null or lvl not in (0, 1, 2) then raise exception $q$Nivel no válido$q$; end if;
  perform public.gifts_sweep();
  if p <= 3 and exists (select 1 from public.gifts where place = p and status in ($q$pending$q$, $q$claimed$q$)) then
    raise exception $q$Ese puesto ya se regaló$q$;
  end if;
  gid := public.gift_send(to_id);
  update public.gifts set place = p, level = lvl where id = gid;
  return gid;
end $$;
revoke all on function public.gift_send_place(uuid, int, int) from public, anon;
grant execute on function public.gift_send_place(uuid, int, int) to authenticated;
