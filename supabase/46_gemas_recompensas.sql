-- =====================================================================
-- AURI · Billetera de AuriGems (cian y moradas) + Recompensas + precios de la novela visual
-- Ejecutar DESPUÉS de 45_look_personajes.sql, en una consulta nueva del SQL Editor.
--
-- Las cantidades se guardan en CUARTOS de gema (1 gema = 4): así se pueden cobrar y regalar cuartos sin decimales raros.
--   · wallets      saldo de cada cuenta (cian = se compran y se pueden donar; moradas = anuncios, NO se donan)
--   · gem_ledger   registro de cada movimiento (quién, cuánto, por qué)
--   · rewards      Recompensas por reclamar (regalos de la Owner, donaciones, y más adelante códigos y compras)
-- Solo el servidor mueve el dinero: nadie puede escribir directo en estas tablas.
-- =====================================================================

create table if not exists public.wallets (
  uid uuid primary key references public.profiles(id) on delete cascade,
  cyan int not null default 0 check (cyan >= 0),
  purple int not null default 0 check (purple >= 0),
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists wal_own on public.wallets;
create policy wal_own on public.wallets for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.wallets from anon, authenticated;

create table if not exists public.gem_ledger (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('cyan','purple')),
  delta int not null check (delta <> 0),
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists gl_uid on public.gem_ledger (uid, created_at desc);
create index if not exists gl_ref on public.gem_ledger (uid, ref) where ref is not null;
alter table public.gem_ledger enable row level security;
drop policy if exists gl_own on public.gem_ledger;
create policy gl_own on public.gem_ledger for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.gem_ledger from anon, authenticated;

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  to_uid uuid not null references public.profiles(id) on delete cascade,
  from_uid uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('owner','donation','code','purchase','system')),
  kind text not null default 'gems_cyan' check (kind in ('gems_cyan')),
  amount int not null check (amount > 0),
  note text not null default '' check (length(note) <= 140),
  created_at timestamptz not null default now(),
  expires_at timestamptz,                                   -- vacío = no vence (regalos de la Owner, códigos y compras)
  claimed_at timestamptz,
  returned_at timestamptz                                   -- si una donación vence, vuelve a quien la envió
);
create index if not exists rw_to on public.rewards (to_uid, claimed_at, returned_at);
create index if not exists rw_from on public.rewards (from_uid, created_at desc);
create index if not exists rw_exp on public.rewards (expires_at) where claimed_at is null and returned_at is null;
alter table public.rewards enable row level security;
drop policy if exists rw_sel on public.rewards;
create policy rw_sel on public.rewards for select to authenticated using (to_uid = auth.uid() or from_uid = auth.uid());
revoke insert, update, delete on public.rewards from anon, authenticated;

insert into public.vn_config (key, value, note) values
  ('reward_expire_hours', 72, 'Horas que tiene alguien para reclamar una donación; si no, vuelve a quien la envió (los regalos de la Owner no vencen)'),
  ('donations_per_day', 10, 'Máximo de donaciones que una cuenta (que no es Owner) puede enviar al día')
on conflict (key) do nothing;

-- ---------- precios (en cuartos de gema) ----------
alter table public.vn_prices add column if not exists q int;
insert into public.vn_prices (item, gems, q, note) values
  ('chapter', 6, 24, 'Leer un capítulo en novela visual con IA (análisis y fondos)'),
  ('cg', 6, 24, 'Una ilustración especial (CG) con la IA; solo gemas cian'),
  ('sprite', 4, 16, 'Un sprite generado con IA para un personaje de la autoría')
on conflict (item) do update set gems = excluded.gems, q = excluded.q, note = excluded.note;
update public.vn_prices set q = gems * 4 where q is null;

-- ---------- funciones internas (solo servidor) ----------
create or replace function public._wallet_ensure(p_uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.wallets (uid) values (p_uid) on conflict (uid) do nothing
$$;

-- Cobra. Devuelve {ok:true,...} o {ok:false, need, have}. Si ya se cobró lo mismo (misma referencia) no cobra de nuevo.
create or replace function public.gems_spend(p_uid uuid, p_q int, p_reason text, p_ref text default null, p_cyan_only boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.wallets; pp int; cc int;
begin
  if p_q is null or p_q <= 0 then return jsonb_build_object('ok', true, 'cyan', 0, 'purple', 0); end if;
  if p_ref is not null
     and exists (select 1 from public.gem_ledger where uid = p_uid and ref = p_ref and delta < 0)
     and not exists (select 1 from public.gem_ledger where uid = p_uid and ref = 'refund:' || p_ref) then
    return jsonb_build_object('ok', true, 'paid_before', true);
  end if;
  perform public._wallet_ensure(p_uid);
  select * into w from public.wallets where uid = p_uid for update;
  pp := case when p_cyan_only then 0 else least(w.purple, p_q) end; cc := p_q - pp;
  if w.cyan < cc then return jsonb_build_object('ok', false, 'need', p_q, 'have', w.cyan + case when p_cyan_only then 0 else w.purple end); end if;
  update public.wallets set cyan = cyan - cc, purple = purple - pp, updated_at = now() where uid = p_uid;
  if pp > 0 then insert into public.gem_ledger (uid, kind, delta, reason, ref) values (p_uid, 'purple', -pp, left(p_reason, 80), p_ref); end if;
  if cc > 0 then insert into public.gem_ledger (uid, kind, delta, reason, ref) values (p_uid, 'cyan', -cc, left(p_reason, 80), p_ref); end if;
  return jsonb_build_object('ok', true, 'cyan', cc, 'purple', pp);
end $$;

-- Devuelve lo cobrado con esa referencia (si la generación falló). Solo una vez.
create or replace function public.gems_refund(p_uid uuid, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_ref is null or exists (select 1 from public.gem_ledger where uid = p_uid and ref = 'refund:' || p_ref) then return; end if;
  for r in select kind, -delta as q from public.gem_ledger where uid = p_uid and ref = p_ref and delta < 0 loop
    update public.wallets set cyan = cyan + case when r.kind = 'cyan' then r.q else 0 end, purple = purple + case when r.kind = 'purple' then r.q else 0 end, updated_at = now() where uid = p_uid;
    insert into public.gem_ledger (uid, kind, delta, reason, ref) values (p_uid, r.kind, r.q, 'reembolso', 'refund:' || p_ref);
  end loop;
end $$;

-- Las donaciones que vencieron vuelven a quien las envió (se llama sola cuando alguien abre su billetera o sus recompensas)
create or replace function public._reward_sweep() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select * from public.rewards where expires_at is not null and expires_at < now() and claimed_at is null and returned_at is null order by expires_at limit 200 for update skip locked loop
    if r.from_uid is not null and r.source = 'donation' then
      perform public._wallet_ensure(r.from_uid);
      update public.wallets set cyan = cyan + r.amount, updated_at = now() where uid = r.from_uid;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (r.from_uid, 'cyan', r.amount, 'donación sin reclamar', 'rw:' || r.id);
    end if;
    update public.rewards set returned_at = now() where id = r.id;
  end loop;
end $$;

revoke all on function public._wallet_ensure(uuid), public._reward_sweep() from public, anon, authenticated;
revoke all on function public.gems_spend(uuid, int, text, text, boolean), public.gems_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.gems_spend(uuid, int, text, text, boolean), public.gems_refund(uuid, text) to service_role;

-- ---------- funciones para la app ----------
create or replace function public.my_wallet() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w public.wallets; n int; s int;
begin
  if me is null then return null; end if;
  perform public._reward_sweep(); perform public._wallet_ensure(me);
  select * into w from public.wallets where uid = me;
  select count(*), coalesce(sum(amount), 0) into n, s from public.rewards where to_uid = me and claimed_at is null and returned_at is null and (expires_at is null or expires_at > now());
  return jsonb_build_object('cyan', w.cyan, 'purple', w.purple, 'pending', n, 'pending_q', s);
end $$;

create or replace function public.my_rewards() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '[]'::jsonb; end if;
  perform public._reward_sweep();
  return coalesce((select jsonb_agg(x order by (x->>'created')::timestamptz desc) from (
    select jsonb_build_object('id', r.id, 'dir', case when r.to_uid = me then 'in' else 'out' end, 'source', r.source, 'amount', r.amount, 'note', r.note,
      'created', r.created_at, 'expires', r.expires_at, 'claimed', r.claimed_at, 'returned', r.returned_at,
      'status', case when r.returned_at is not null then 'returned' when r.claimed_at is not null then 'claimed' when r.expires_at is not null and r.expires_at < now() then 'expired' else 'pending' end,
      'other_name', p.name, 'other_username', p.username) as x
    from public.rewards r left join public.profiles p on p.id = case when r.to_uid = me then r.from_uid else r.to_uid end
    where r.to_uid = me or r.from_uid = me
    order by r.created_at desc limit 80) q), '[]'::jsonb);
end $$;

-- Enviar gemas cian a alguien por su @usuario. La Owner no gasta saldo (regala cuantas quiera); los demás las sacan de su saldo cian.
create or replace function public.reward_send(p_username text, p_gems numeric, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); q int; dest uuid; hrs numeric; lim numeric; today int; sp jsonb; rid uuid; is_owner boolean;
begin
  if me is null then raise exception 'Inicia sesión'; end if;
  if p_gems is null or p_gems <= 0 or p_gems * 4 <> round(p_gems * 4) then raise exception 'Cantidad no válida (se puede en cuartos de gema)'; end if;
  q := round(p_gems * 4)::int; if q > 4000000 then raise exception 'Cantidad demasiado grande'; end if;
  select id into dest from public.profiles where lower(username) = lower(btrim(replace(coalesce(p_username, ''), '@', '')));
  if dest is null then raise exception 'Ese usuario no existe'; end if;
  if dest = me then raise exception 'No puedes enviarte gemas a ti'; end if;
  if exists (select 1 from public.blocks where kind = 'block' and ((blocker = dest and blocked = me) or (blocker = me and blocked = dest))) then raise exception 'No se puede enviar a esta cuenta'; end if;
  is_owner := public.my_role() = 'OWNER';
  if is_owner then
    insert into public.rewards (to_uid, from_uid, source, amount, note) values (dest, me, 'owner', q, left(btrim(coalesce(p_note, '')), 140)) returning id into rid;
  else
    if public.is_adult(me) is distinct from public.is_adult(dest) then raise exception 'Solo se puede donar entre cuentas del mismo rango de edad'; end if;
    select value into lim from public.vn_config where key = 'donations_per_day';
    select count(*) into today from public.rewards where from_uid = me and source = 'donation' and created_at >= date_trunc('day', now());
    if today >= coalesce(lim, 10) then raise exception 'Llegaste al máximo de donaciones de hoy'; end if;
    select value into hrs from public.vn_config where key = 'reward_expire_hours';
    sp := public.gems_spend(me, q, 'donación', 'don:' || gen_random_uuid(), true);
    if not (sp->>'ok')::boolean then raise exception 'No te alcanzan las gemas cian'; end if;
    insert into public.rewards (to_uid, from_uid, source, amount, note, expires_at) values (dest, me, 'donation', q, left(btrim(coalesce(p_note, '')), 140), now() + make_interval(hours => coalesce(hrs, 72)::int)) returning id into rid;
  end if;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;

create or replace function public.reward_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rewards;
begin
  if me is null then raise exception 'Inicia sesión'; end if;
  perform public._reward_sweep();
  update public.rewards set claimed_at = now() where id = p_id and to_uid = me and claimed_at is null and returned_at is null and (expires_at is null or expires_at > now()) returning * into r;
  if r.id is null then raise exception 'Esta recompensa ya no está disponible'; end if;
  perform public._wallet_ensure(me);
  update public.wallets set cyan = cyan + r.amount, updated_at = now() where uid = me;
  insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, 'cyan', r.amount, 'recompensa ' || r.source, 'rw:' || r.id);
  return jsonb_build_object('ok', true, 'amount', r.amount);
end $$;

create or replace function public.reward_claim_all() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r record; tot int := 0;
begin
  if me is null then raise exception 'Inicia sesión'; end if;
  perform public._reward_sweep();
  for r in select id from public.rewards where to_uid = me and claimed_at is null and returned_at is null and (expires_at is null or expires_at > now()) loop
    tot := tot + coalesce((public.reward_claim(r.id)->>'amount')::int, 0);
  end loop;
  return jsonb_build_object('ok', true, 'amount', tot);
end $$;

revoke all on function public.my_wallet(), public.my_rewards(), public.reward_send(text, numeric, text), public.reward_claim(uuid), public.reward_claim_all() from public, anon;
grant execute on function public.my_wallet(), public.my_rewards(), public.reward_send(text, numeric, text), public.reward_claim(uuid), public.reward_claim_all() to authenticated;

-- ---------- 5000 gemas cian para la Owner (una sola vez) ----------
do $$
declare o uuid;
begin
  select id into o from public.profiles where role = 'OWNER' order by created_at limit 1;
  if o is not null and not exists (select 1 from public.gem_ledger where uid = o and reason = 'regalo inicial') then
    perform public._wallet_ensure(o);
    update public.wallets set cyan = cyan + 20000, updated_at = now() where uid = o;
    insert into public.gem_ledger (uid, kind, delta, reason) values (o, 'cyan', 20000, 'regalo inicial');
  end if;
end $$;
