-- Punto verde de conexión: cuándo estuvo conectada cada persona y si permite que se vea
alter table public.profiles add column if not exists last_seen timestamptz;
alter table public.profiles add column if not exists show_online boolean not null default true;
