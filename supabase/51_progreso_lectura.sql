-- Progreso de lectura de novela visual, sincronizado entre dispositivos (cada persona solo ve el suyo).
create table if not exists public.vn_progress (
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  chapter_idx int not null,
  pos_si int not null default 0,
  pos_off int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id, chapter_idx)
);
alter table public.vn_progress enable row level security;
drop policy if exists vnp_sel on public.vn_progress;
create policy vnp_sel on public.vn_progress for select to authenticated using (user_id = auth.uid());
drop policy if exists vnp_ins on public.vn_progress;
create policy vnp_ins on public.vn_progress for insert to authenticated with check (user_id = auth.uid());
drop policy if exists vnp_upd on public.vn_progress;
create policy vnp_upd on public.vn_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists vnp_del on public.vn_progress;
create policy vnp_del on public.vn_progress for delete to authenticated using (user_id = auth.uid());
