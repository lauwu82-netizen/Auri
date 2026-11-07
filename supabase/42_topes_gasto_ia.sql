-- =====================================================================
-- AURI · Topes de gasto de las IAs
-- Ejecutar DESPUÉS de 41_novela_ajuste.sql, en una consulta nueva del SQL Editor.
--
-- Protege tu saldo. Cada vez que una función del servidor usa una IA, antes pregunta vn_budget_ok() y después anota el costo
-- con vn_usage_add(). Si se llega a un tope, las generaciones nuevas se pausan (leer en texto normal sigue igual).
--   · Tope mensual global (en dólares)     · Máximo de generaciones por cuenta al día     · Interruptor general
-- Los topes se cambian con un UPDATE sencillo en vn_config, sin tocar la app. Solo el servidor escribe aquí.
-- =====================================================================
create table if not exists public.vn_config (key text primary key, value numeric not null, note text not null default '');
insert into public.vn_config (key, value, note) values
  ('monthly_cap_usd', 8, 'Gasto máximo del mes en dólares; al llegar se pausan las generaciones nuevas'),
  ('daily_per_user', 12, 'Máximo de generaciones por cuenta al día'),
  ('enabled', 1, '1 = generaciones activas, 0 = pausadas (interruptor general)')
on conflict (key) do nothing;
alter table public.vn_config enable row level security;
revoke all on public.vn_config from anon, authenticated;

create table if not exists public.vn_usage (
  id bigint generated always as identity primary key,
  uid uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('analysis','background','cg','retry','other')),
  cost_usd numeric(10,4) not null check (cost_usd >= 0),
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists vn_usage_day on public.vn_usage (created_at);
create index if not exists vn_usage_uid on public.vn_usage (uid, created_at);
alter table public.vn_usage enable row level security;
drop policy if exists vnu_own on public.vn_usage;
create policy vnu_own on public.vn_usage for select to authenticated using (uid = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'OWNER'));
revoke insert, update, delete on public.vn_usage from anon, authenticated;

-- ¿Se puede generar ahora? (lo llama el servidor con la cuenta de quien pide)
create or replace function public.vn_budget_ok(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cap numeric; per int; en numeric; spent numeric; today int;
begin
  select value into en from public.vn_config where key = 'enabled';
  if coalesce(en, 1) < 1 then return jsonb_build_object('ok', false, 'reason', 'paused'); end if;
  select value into cap from public.vn_config where key = 'monthly_cap_usd';
  select coalesce(sum(cost_usd), 0) into spent from public.vn_usage where created_at >= date_trunc('month', now());
  if spent >= coalesce(cap, 8) then return jsonb_build_object('ok', false, 'reason', 'monthly_cap', 'spent', spent); end if;
  select value::int into per from public.vn_config where key = 'daily_per_user';
  select count(*) into today from public.vn_usage where uid = p_uid and kind <> 'analysis' and created_at >= date_trunc('day', now());
  if today >= coalesce(per, 12) then return jsonb_build_object('ok', false, 'reason', 'daily_user', 'today', today); end if;
  return jsonb_build_object('ok', true, 'spent', spent, 'left', coalesce(cap, 8) - spent);
end $$;

create or replace function public.vn_usage_add(p_uid uuid, p_kind text, p_cost numeric, p_detail text default '') returns void
language sql security definer set search_path = public as $$
  insert into public.vn_usage (uid, kind, cost_usd, detail) values (p_uid, p_kind, p_cost, left(coalesce(p_detail, ''), 200));
$$;
-- solo el servidor (service_role) las puede llamar
revoke all on function public.vn_budget_ok(uuid) from public, anon, authenticated;
revoke all on function public.vn_usage_add(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.vn_budget_ok(uuid), public.vn_usage_add(uuid, text, numeric, text) to service_role;

-- Resumen para la Owner (gasto del mes y por tipo)
create or replace function public.vn_spend_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'OWNER') then raise exception 'Solo la Owner'; end if;
  select jsonb_build_object('month', coalesce(sum(cost_usd), 0), 'cap', (select value from public.vn_config where key = 'monthly_cap_usd'),
    'by_kind', coalesce((select jsonb_object_agg(kind, s) from (select kind, round(sum(cost_usd), 4) s from public.vn_usage where created_at >= date_trunc('month', now()) group by kind) q), '{}'))
  into r from public.vn_usage where created_at >= date_trunc('month', now());
  return r;
end $$;
revoke all on function public.vn_spend_summary() from public, anon;
grant execute on function public.vn_spend_summary() to authenticated;
