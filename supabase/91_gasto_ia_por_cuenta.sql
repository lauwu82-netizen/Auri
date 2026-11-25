-- =====================================================================
-- AURI · Gasto de IA: ahora también por cuenta (lecturas pagadas y gemas) y detalle de intentos fallidos
-- Reemplaza la función vn_spend_report del SQL 90. Se puede correr varias veces.
-- Los cuerpos de función se cierran con $fn$ y los textos usan $q$ ... $q$ (sin comillas simples).
-- =====================================================================

create or replace function public.vn_spend_report(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r jsonb; since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = $q$OWNER$q$) then raise exception $q$Solo la Owner$q$; end if;
  select jsonb_build_object(
    $q$month$q$, coalesce((select sum(cost_usd) from public.vn_usage where created_at >= date_trunc($q$month$q$, now())), 0),
    $q$cap$q$, (select value from public.vn_config where key = $q$monthly_cap_usd$q$),
    $q$days$q$, greatest(1, least(coalesce(p_days, 30), 365)),
    $q$total$q$, coalesce((select sum(cost_usd) from public.vn_usage where created_at >= since), 0),
    $q$by_kind$q$, coalesce((select jsonb_object_agg(kind, s) from (select kind, round(sum(cost_usd), 4) s from public.vn_usage where created_at >= since group by kind) q), $q${}$q$::jsonb),
    $q$chapters$q$, (select count(distinct chapter_id) from public.vn_usage where chapter_id is not null and created_at >= since),
    $q$chapters_cost$q$, coalesce((select sum(cost_usd) from public.vn_usage where chapter_id is not null and created_at >= since), 0),
    $q$reads$q$, (select count(distinct (uid, ref)) from public.gem_ledger where reason = $q$chapter$q$ and delta < 0 and created_at >= since),
    $q$reads_gems$q$, coalesce((select sum(-delta) from public.gem_ledger where reason = $q$chapter$q$ and delta < 0 and created_at >= since), 0),
    $q$recent$q$, coalesce((select jsonb_agg(x order by x.last desc) from (
        select u.chapter_id, coalesce(c.title, $q$(capítulo borrado)$q$) as title, round(sum(u.cost_usd), 4) as cost, count(*) as calls, max(u.created_at) as last
        from public.vn_usage u left join public.chapters c on c.id = u.chapter_id
        where u.chapter_id is not null and u.created_at >= since
        group by u.chapter_id, c.title order by max(u.created_at) desc limit 15) x), $q$[]$q$::jsonb),
    $q$users$q$, coalesce((select jsonb_agg(y order by y.cost desc, y.reads desc) from (
        select coalesce(p.name, $q$?$q$) as name, coalesce(p.username, $q$$q$) as username, round(coalesce(u.cost, 0), 4) as cost, coalesce(g.reads, 0) as reads, coalesce(g.gems, 0) as gems
        from public.profiles p
        left join (select uid, sum(cost_usd) as cost from public.vn_usage where created_at >= since group by uid) u on u.uid = p.id
        left join (select uid, count(distinct ref) as reads, sum(-delta) as gems from public.gem_ledger where reason = $q$chapter$q$ and delta < 0 and created_at >= since group by uid) g on g.uid = p.id
        where u.uid is not null or g.uid is not null
        order by coalesce(u.cost, 0) desc, coalesce(g.reads, 0) desc limit 12) y), $q$[]$q$::jsonb),
    $q$fails$q$, coalesce((select jsonb_agg(f order by f.at desc) from (
        select detail, created_at as at from public.vn_usage where kind = $q$retry$q$ and created_at >= since order by created_at desc limit 8) f), $q$[]$q$::jsonb)
  ) into r;
  return r;
end $fn$;
revoke all on function public.vn_spend_report(int) from public, anon;
grant execute on function public.vn_spend_report(int) to authenticated;
