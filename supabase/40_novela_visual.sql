-- =====================================================================
-- AURI · Novela visual · base de datos
-- Ejecutar DESPUÉS de 39_peso_reportes.sql, en una consulta nueva del SQL Editor.
--
-- Deja listo el terreno para el modo novela visual SIN necesitar todavía las APIs de IA:
--  · stories.vn: la autoría marca su libro como "compatible con novela visual".
--  · vn_emotions: lista de emociones (cuáles son gratis y cuáles de pago). Se cambia con un UPDATE, sin tocar la app.
--  · vn_characters: personajes del libro (hasta 10) con nombre, edad adulta sí/no y sus sprites por emoción.
--  · vn_runs: una fila por capítulo-y-versión. La primera persona que la crea es la "primera lectora": ella dispara la
--    preparación y las demás reutilizan lo que quedó guardado (análisis y fondo). Se reinicia solo si la autoría edita el capítulo.
--  · vn_scripts / vn_assets: lo que genera la IA (guion con emociones y fondos). Solo lo escribe el servidor.
--  · vn_cgs: los CG de cada lectora con su OC (máx. 3 por capítulo). No se comparten.
--  · vn_prices: precios en AuriGems (provisionales, se ajustan cuando se conozcan los costos reales).
-- =====================================================================

alter table public.stories add column if not exists vn boolean not null default false;

create table if not exists public.vn_emotions (
  key text primary key, name text not null, free boolean not null default true, sort int not null default 0
);
insert into public.vn_emotions (key, name, free, sort) values
  ('neutral','Neutral',true,0), ('feliz','Feliz',true,1), ('triste','Triste',true,2),
  ('sonrojado','Sonrojado',true,3), ('asustado','Asustado',true,4), ('enojado','Enojado',true,5)
on conflict (key) do nothing;
alter table public.vn_emotions enable row level security;
drop policy if exists vne_sel on public.vn_emotions;
create policy vne_sel on public.vn_emotions for select to authenticated using (true);
revoke insert, update, delete on public.vn_emotions from anon, authenticated;

create table if not exists public.vn_characters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  adult boolean not null default true,                    -- la autoría declara que el personaje es mayor de edad
  pos int not null default 0,
  sprites jsonb not null default '{}' check (jsonb_typeof(sprites) = 'object'),   -- {"neutral": "https://…", "feliz": "https://…"}
  created_at timestamptz not null default now()
);
create index if not exists vnc_story_idx on public.vn_characters(story_id, pos);
alter table public.vn_characters enable row level security;
drop policy if exists vnc_sel on public.vn_characters;
create policy vnc_sel on public.vn_characters for select to authenticated using (true);
drop policy if exists vnc_ins on public.vn_characters;
create policy vnc_ins on public.vn_characters for insert to authenticated with check (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));
drop policy if exists vnc_upd on public.vn_characters;
create policy vnc_upd on public.vn_characters for update to authenticated using (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));
drop policy if exists vnc_del on public.vn_characters;
create policy vnc_del on public.vn_characters for delete to authenticated using (exists (select 1 from public.stories s where s.id = story_id and s.owner = auth.uid()));

-- máximo 10 personajes por libro; los sprites solo pueden ser enlaces de nuestro Storage y de emociones que existen
create or replace function public.vn_char_guard() returns trigger language plpgsql as $$
declare k text; v text;
begin
  if tg_op = 'INSERT' and (select count(*) from public.vn_characters where story_id = new.story_id) >= 10 then raise exception 'Máximo 10 personajes por libro'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(new.sprites) loop
    if not exists (select 1 from public.vn_emotions where key = k) then raise exception 'Emoción no válida: %', k; end if;
    if v is null or length(v) > 600 or v !~ '^https://' then raise exception 'Sprite no válido'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_vn_char_guard on public.vn_characters;
create trigger trg_vn_char_guard before insert or update on public.vn_characters for each row execute function public.vn_char_guard();

-- una preparación por capítulo y versión del texto. La primera persona en pedirla la dispara.
create table if not exists public.vn_runs (
  chapter_id uuid not null,
  hash text not null,                                   -- huella del texto del capítulo (si lo editan, cambia y se vuelve a preparar)
  first_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  error text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (chapter_id, hash)
);
alter table public.vn_runs enable row level security;
drop policy if exists vnr_sel on public.vn_runs;
create policy vnr_sel on public.vn_runs for select to authenticated using (true);
revoke insert, update, delete on public.vn_runs from anon, authenticated;

create table if not exists public.vn_scripts (
  chapter_id uuid not null, hash text not null,
  script jsonb not null,                                -- tramos con quién habla, emoción por frase, lugar y momentos de CG
  created_at timestamptz not null default now(),
  primary key (chapter_id, hash)
);
alter table public.vn_scripts enable row level security;
drop policy if exists vns_sel on public.vn_scripts;
create policy vns_sel on public.vn_scripts for select to authenticated using (true);
revoke insert, update, delete on public.vn_scripts from anon, authenticated;

create table if not exists public.vn_assets (
  chapter_id uuid not null, hash text not null, key text not null,   -- key = lugar del guion (p. ej. "bosque-noche")
  url text not null, created_at timestamptz not null default now(),
  primary key (chapter_id, hash, key)
);
alter table public.vn_assets enable row level security;
drop policy if exists vna_sel on public.vn_assets;
create policy vna_sel on public.vn_assets for select to authenticated using (true);
revoke insert, update, delete on public.vn_assets from anon, authenticated;

create table if not exists public.vn_cgs (
  uid uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null, hash text not null, slot int not null check (slot between 1 and 3),
  oc text not null default '',                          -- huella de la tarjeta del OC con la que se generó
  url text not null, created_at timestamptz not null default now(),
  primary key (uid, chapter_id, hash, slot)
);
alter table public.vn_cgs enable row level security;
drop policy if exists vncg_sel on public.vn_cgs;
create policy vncg_sel on public.vn_cgs for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.vn_cgs from anon, authenticated;

create table if not exists public.vn_prices (
  item text primary key, gems int not null check (gems >= 0), note text not null default ''
);
insert into public.vn_prices (item, gems, note) values
  ('chapter', 5, 'Leer un capítulo en novela visual (análisis y fondo, todos pagan lo mismo)'),
  ('cg', 3, 'Un CG con el OC de la lectora (provisional)')
on conflict (item) do nothing;
alter table public.vn_prices enable row level security;
drop policy if exists vnp_sel on public.vn_prices;
create policy vnp_sel on public.vn_prices for select to authenticated using (true);
revoke insert, update, delete on public.vn_prices from anon, authenticated;

-- Pedir la preparación de un capítulo: devuelve el estado y si esta persona es la primera.
-- (El cobro en AuriGems se conecta aquí cuando exista la billetera.)
create or replace function public.vn_start(p_chapter uuid, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int; r public.vn_runs;
begin
  if me is null then raise exception 'Inicia sesión'; end if;
  if p_hash is null or length(p_hash) not between 8 and 80 then raise exception 'Huella no válida'; end if;
  if not exists (select 1 from public.chapter_published where chapter_id = p_chapter) then raise exception 'Capítulo no disponible'; end if;
  insert into public.vn_runs (chapter_id, hash, first_by) values (p_chapter, p_hash, me) on conflict do nothing;
  get diagnostics n = row_count;
  select * into r from public.vn_runs where chapter_id = p_chapter and hash = p_hash;
  return jsonb_build_object('status', r.status, 'first', n > 0, 'error', r.error);
end $$;
revoke all on function public.vn_start(uuid, text) from public, anon;
grant execute on function public.vn_start(uuid, text) to authenticated;
