-- Fondos de cada historia: la autoría sube imágenes desde su galería y las ajusta (posición y zoom).
create table if not exists public.vn_backgrounds (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  place text not null default '',
  label text not null default '',
  url text not null,
  pos_x int not null default 50,
  pos_y int not null default 50,
  zoom int not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists vnb_story_idx on public.vn_backgrounds(story_id);
alter table public.vn_backgrounds enable row level security;
drop policy if exists vnb_sel on public.vn_backgrounds;
create policy vnb_sel on public.vn_backgrounds for select to authenticated using (true);
drop policy if exists vnb_ins on public.vn_backgrounds;
create policy vnb_ins on public.vn_backgrounds for insert to authenticated with check (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));
drop policy if exists vnb_upd on public.vn_backgrounds;
create policy vnb_upd on public.vn_backgrounds for update to authenticated using (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid())) with check (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));
drop policy if exists vnb_del on public.vn_backgrounds;
create policy vnb_del on public.vn_backgrounds for delete to authenticated using (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));
