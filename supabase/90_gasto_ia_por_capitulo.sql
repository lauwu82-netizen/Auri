-- =====================================================================
-- AURI · Gasto de IA por capítulo (solo la Owner lo ve)
-- Se puede correr varias veces. Sin comillas simples: se usa $q$ ... $q$.
-- Qué hace:
--   · Cada vez que el servidor gasta IA en un capítulo, anota de qué capítulo fue.
--   · vn_spend_report() devuelve el gasto del mes, por tipo, y el promedio por capítulo.
-- Los costos son ESTIMADOS (los pone la función vn-generate); se comparan con la
-- factura real de Replicate para ajustarlos.
-- =====================================================================

alter table public.vn_usage add column if not exists chapter_id uuid;
create index if not exists vn_usage_chapter on public.vn_usage (chapter_id) where chapter_id is not null;

drop function if exists public.vn_usage_add(uuid, text, numeric, text);
create or replace function public.vn_usage_add(p_uid uuid, p_kind text, p_cost numeric, p_detail text default $q$$q$, p_chapter uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.vn_usage (uid, kind, cost_usd, detail, chapter_id) values (p_uid, p_kind, p_cost, left(coalesce(p_detail, $q$$q$), 200), p_chapter);
$$;
revoke all on function public.vn_usage_add(uuid, text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.vn_usage_add(uuid, text, numeric, text, uuid) to service_role;

create or replace function public.vn_spend_report(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    $q$recent$q$, coalesce((select jsonb_agg(x order by x.last desc) from (
        select u.chapter_id, coalesce(c.title, $q$(capítulo borrado)$q$) as title, round(sum(u.cost_usd), 4) as cost, count(*) as calls, max(u.created_at) as last
        from public.vn_usage u left join public.chapters c on c.id = u.chapter_id
        where u.chapter_id is not null and u.created_at >= since
        group by u.chapter_id, c.title order by max(u.created_at) desc limit 15) x), $q$[]$q$::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.vn_spend_report(int) from public, anon;
grant execute on function public.vn_spend_report(int) to authenticated;
