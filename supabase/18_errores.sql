-- Reportes de errores de la app: los envía cualquier cuenta; solo la Owner los ve todos y los gestiona.
-- Quien reporta ve únicamente los suyos. Límite: 10 reportes al día por cuenta. Al marcar "resuelto" se avisa a quien reportó.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'error' check (kind in ('error','visual','sugerencia','otro')),
  text text not null check (char_length(text) between 1 and 1500),
  imgs text[] not null default '{}' check (cardinality(imgs) <= 4),
  screen text not null default '' check (char_length(screen) <= 200),
  meta text not null default '' check (char_length(meta) <= 400),
  status text not null default 'open' check (status in ('open','seen','working','resolved')),
  note text not null default '' check (char_length(note) <= 600),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists bug_reports_by_idx on public.bug_reports(by, created_at desc);
alter table public.bug_reports enable row level security;

drop policy if exists bug_ins on public.bug_reports;
create policy bug_ins on public.bug_reports for insert to authenticated
  with check (by = auth.uid() and status = 'open' and (select count(*) from public.bug_reports b where b.by = auth.uid() and b.created_at > now() - interval '1 day') < 10);
drop policy if exists bug_sel on public.bug_reports;
create policy bug_sel on public.bug_reports for select to authenticated using (by = auth.uid() or public.is_owner());
drop policy if exists bug_upd on public.bug_reports;
create policy bug_upd on public.bug_reports for update to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists bug_del on public.bug_reports;
create policy bug_del on public.bug_reports for delete to authenticated using (public.is_owner());

create or replace function public.bug_resolved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.handled_at := now();
    insert into public.notifications (user_id, type, extra)
    values (new."by", 'sys', 'Tu reporte de error fue resuelto. ¡Gracias por avisarnos!');
  end if;
  return new;
end $$;
drop trigger if exists trg_bug_resolved on public.bug_reports;
create trigger trg_bug_resolved before update on public.bug_reports for each row execute function public.bug_resolved();

grant select, insert on public.bug_reports to authenticated;
grant update, delete on public.bug_reports to authenticated;
