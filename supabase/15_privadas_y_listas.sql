-- Historias privadas (solo las ve su autoría) y listas de seguidores/seguidos ocultas
alter table public.stories  add column if not exists private boolean not null default false;
alter table public.profiles add column if not exists hide_lists boolean not null default false;

create or replace function public.story_public(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stories s
                 where s.id = sid
                   and not s.private
                   and exists (select 1 from public.chapter_published p where p.story_id = s.id)
                   and not exists (select 1 from public.takedowns t where t.story_id = s.id)
                   and (not s.mature or public.viewer_adult()))
$$;
create or replace function public.story_private(sid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select private from public.stories where id = sid), false) $$;

drop policy if exists s_sel on public.stories;
create policy s_sel on public.stories for select using (owner = auth.uid() or (not private and (public.in_scope(community) or public.story_public(id))));
drop policy if exists c_sel on public.chapters;
create policy c_sel on public.chapters for select to authenticated using (public.story_owner(story_id) = auth.uid() or (public.in_scope(public.story_comm(story_id)) and not public.story_private(story_id)));
drop policy if exists cp_sel on public.chapter_published;
create policy cp_sel on public.chapter_published for select using (public.story_owner(story_id) = auth.uid() or (not public.story_private(story_id) and (public.story_public(story_id) or public.in_scope(public.story_comm(story_id)))));
