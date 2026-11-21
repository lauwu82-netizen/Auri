-- Auri · Ticket de impulso (pase de escritor de paga, nivel 11). Repetible.
-- El ticket es un objeto de la cuenta (ticket:impulso en profiles.items); al usarlo se consume y el libro
-- aparece 24 horas en la fila «Impulsados de hoy» del feed. No toca pass_claims ni otros premios.
begin;

-- Impulsos activos o pasados (solo se crean con la funcion de abajo).
create table if not exists public.story_boosts (
  id        uuid primary key default gen_random_uuid(),
  story_id  uuid not null references public.stories(id) on delete cascade,
  owner     uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at   timestamptz not null
);
create index if not exists story_boosts_end_idx on public.story_boosts(ends_at);
create index if not exists story_boosts_story_idx on public.story_boosts(story_id);
alter table public.story_boosts enable row level security;

-- Leer: la autoria ve los suyos; los demas solo los activos de libros publicos (respeta +18).
drop policy if exists sb_sel on public.story_boosts;
create policy sb_sel on public.story_boosts for select using (owner = auth.uid() or (ends_at > now() and public.story_public(story_id)));
-- Sin politicas de insertar, cambiar o borrar: solo la funcion use_boost_ticket escribe aqui.
revoke insert, update, delete on public.story_boosts from anon, authenticated;
grant select on public.story_boosts to anon, authenticated;

-- Usar el ticket: valida, gasta el ticket y crea el impulso de 24 horas.
create or replace function public.use_boost_ticket(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); its text[]; fin timestamptz;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  if public.active_ban(me) then raise exception $q$Tu cuenta no puede usar esto ahora$q$; end if;
  select items into its from public.profiles where id = me for update;
  if not ($q$ticket:impulso$q$ = any(coalesce(its, array[]::text[]))) then raise exception $q$No tienes un ticket de impulso$q$; end if;
  if not exists (select 1 from public.stories s where s.id = p_story and s.owner = me) then raise exception $q$Solo puedes impulsar tus propios libros$q$; end if;
  if not exists (select 1 from public.chapter_published p where p.story_id = p_story) or exists (select 1 from public.takedowns t where t.story_id = p_story) then
    raise exception $q$El libro necesita capitulos aprobados y publicos$q$;
  end if;
  if exists (select 1 from public.story_boosts b where b.story_id = p_story and b.ends_at > now()) then
    raise exception $q$Este libro ya tiene un impulso activo$q$;
  end if;
  fin := now() + interval $q$24 hours$q$;
  insert into public.story_boosts (story_id, owner, ends_at) values (p_story, me, fin);
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = array_remove(items, $q$ticket:impulso$q$) where id = me;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true, $q$ends_at$q$, fin);
end $$;
revoke all on function public.use_boost_ticket(uuid) from public, anon;
grant execute on function public.use_boost_ticket(uuid) to authenticated;

-- Premio: pase de escritor de paga, nivel 11. Si hubiera otro premio ahi, se cancela todo sin cambiar nada.
do $$
begin
  if exists (select 1 from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 11 and item <> $q$ticket:impulso$q$) then
    raise exception $q$writer/paid/11 tiene premios inesperados; no se cambio nada$q$;
  end if;
end $$;
delete from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 11 and item = $q$ticket:impulso$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key)
values ($q$writer$q$, $q$paid$q$, 11, $q$item$q$, $q$ticket:impulso$q$, 0, $q$ticket:impulso$q$);

commit;

select level, kind, item, key from public.pass_rewards where track = $q$writer$q$ and tier = $q$paid$q$ and level = 11;
select count(*) as impulsos from public.story_boosts;
