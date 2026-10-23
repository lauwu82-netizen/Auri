-- "Alguien lo está revisando": marca temporal para que el equipo no abra el mismo libro a la vez
create table if not exists public.review_claims (
  story_id uuid primary key references public.stories(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  at       timestamptz not null default now()
);
alter table public.review_claims enable row level security;
drop policy if exists rc_sel on public.review_claims; create policy rc_sel on public.review_claims for select using (public.is_staff());
drop policy if exists rc_ins on public.review_claims; create policy rc_ins on public.review_claims for insert with check (public.is_staff() and user_id = auth.uid());
drop policy if exists rc_upd on public.review_claims; create policy rc_upd on public.review_claims for update using (public.is_staff()) with check (user_id = auth.uid());
drop policy if exists rc_del on public.review_claims; create policy rc_del on public.review_claims for delete using (user_id = auth.uid() or public.is_owner());
