-- Biblioteca global de fondos: se generan una sola vez (por la Owner) y todo el mundo los lee sin llamar a Replicate.
create table if not exists public.vn_bg_library (
  key text primary key,
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.vn_bg_library enable row level security;
drop policy if exists vn_bg_library_read on public.vn_bg_library;
create policy vn_bg_library_read on public.vn_bg_library for select using (true);
-- escribir solo lo hace la función del servidor (llave de servicio)
