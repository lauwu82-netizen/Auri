-- Auri · el tope diario de generaciones no aplica a la Owner y no cuenta reintentos ni descripciones de personajes
-- Ejecutar en una consulta nueva del SQL Editor.
create or replace function public.vn_budget_ok(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cap numeric; per int; en numeric; spent numeric; today int; owner boolean;
begin
  select value into en from public.vn_config where key = 'enabled';
  if coalesce(en, 1) < 1 then return jsonb_build_object('ok', false, 'reason', 'paused'); end if;
  select value into cap from public.vn_config where key = 'monthly_cap_usd';
  select coalesce(sum(cost_usd), 0) into spent from public.vn_usage where created_at >= date_trunc('month', now());
  if spent >= coalesce(cap, 8) then return jsonb_build_object('ok', false, 'reason', 'monthly_cap', 'spent', spent); end if;
  select exists (select 1 from public.profiles where id = p_uid and role = 'OWNER') into owner;
  if not owner then
    select value::int into per from public.vn_config where key = 'daily_per_user';
    select count(*) into today from public.vn_usage where uid = p_uid and kind in ('cg', 'background') and created_at >= date_trunc('day', now());
    if today >= coalesce(per, 12) then return jsonb_build_object('ok', false, 'reason', 'daily_user', 'today', today); end if;
  end if;
  return jsonb_build_object('ok', true, 'spent', spent, 'left', coalesce(cap, 8) - spent);
end $$;
revoke all on function public.vn_budget_ok(uuid) from public, anon, authenticated;
grant execute on function public.vn_budget_ok(uuid) to service_role;
