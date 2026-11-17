-- Contador de compartidos de cada libro (solo la autoria lo ve)
create table if not exists public.book_shares (
  id bigint generated always as identity primary key,
  story_id uuid not null,
  uid uuid,
  kind text not null check (kind in ($q$native$q$, $q$copy$q$, $q$friend$q$, $q$qr$q$, $q$visit$q$)),
  created_at timestamptz not null default now()
);
create index if not exists book_shares_story_idx on public.book_shares (story_id, kind);
alter table public.book_shares enable row level security;
-- sin politicas: nadie la lee ni la escribe directo, solo con las funciones de abajo

create or replace function public.share_log(p_story uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  if p_kind not in ($q$native$q$, $q$copy$q$, $q$friend$q$, $q$qr$q$, $q$visit$q$) then return; end if;
  select owner into o from public.stories where id = p_story;
  if o is null or o = me then return; end if;              -- libro que no existe, o la propia autoria
  if me is not null and (select count(*) from public.book_shares where uid = me and created_at > now() - interval $q$1 minute$q$) >= 20 then return; end if;
  insert into public.book_shares (story_id, uid, kind) values (p_story, me, p_kind);
end $$;

create or replace function public.share_stats(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  select owner into o from public.stories where id = p_story;
  if o is null or me is null or (o <> me and not public.is_owner()) then return $q${}$q$::jsonb; end if;
  return coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.book_shares where story_id = p_story group by kind) x), $q${}$q$::jsonb);
end $$;

revoke all on function public.share_log(uuid, text) from public;
revoke all on function public.share_stats(uuid) from public, anon;
grant execute on function public.share_log(uuid, text) to anon, authenticated;
grant execute on function public.share_stats(uuid) to authenticated;
