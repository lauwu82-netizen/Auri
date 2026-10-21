-- =====================================================================
-- AURI · Revisión automática de capítulos con IA (primer filtro)
-- Ejecutar DESPUÉS de 10_sin_avisos_equipo.sql, en una consulta nueva del SQL Editor.
--
-- Cómo funciona:
--  1. Quien escribe envía un capítulo: queda "pending" (oculto), como siempre.
--  2. La app llama a la función "moderate-chapter" (Edge Function) que lee el capítulo
--     desde la base de datos, lo pasa por la IA y le dice a la base de datos el resultado.
--  3. Limpio  -> se aprueba solo (si ya están aprobados los anteriores) y se publica.
--     Marcado -> se queda pendiente (oculto) con la razón, para que moderación lo revise.
--  4. Si la IA falla o no responde, no pasa nada: el capítulo sigue pendiente para moderación.
--
-- Nadie desde la app puede aprobar con este mecanismo: la función de abajo solo la puede
-- ejecutar la Edge Function (service_role). Quien escribe no puede marcar su capítulo como "limpio".
-- =====================================================================

create table if not exists public.chapter_ai (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  verdict    text not null check (verdict in ('clean','flagged')),
  hash       text not null,                       -- huella del texto que se revisó (si cambia el texto, esta revisión ya no vale)
  mature     boolean not null default false,      -- si el libro estaba marcado +18 cuando se revisó
  flags      jsonb,                               -- por qué se marcó (categorías, puntajes y un fragmento)
  created_at timestamptz not null default now()
);
create index if not exists chapter_ai_story_idx on public.chapter_ai(story_id);
alter table public.chapter_ai enable row level security;
drop policy if exists cai_sel on public.chapter_ai;
create policy cai_sel on public.chapter_ai for select
  using (public.story_owner(story_id) = auth.uid() or public.in_scope(public.story_comm(story_id)));
revoke all on public.chapter_ai from anon, authenticated;
grant select on public.chapter_ai to authenticated;   -- solo lectura; escribir lo hace únicamente la Edge Function

-- huella de un capítulo (la Edge Function calcula la misma con SHA-256)
create or replace function public.chapter_hash(t text, x text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t,'') || E'\n' || coalesce(x,''), 'UTF8')), 'hex') $$;

-- ¿están publicados o aprobados todos los capítulos anteriores?
create or replace function public.prev_chapters_ok(sid uuid, pos int) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.chapters c
    where c.story_id = sid and c.position < pos
      and not exists (select 1 from public.chapter_published p where p.chapter_id = c.id)
      and c.status <> 'approved')
$$;

-- La Edge Function entrega el resultado. Devuelve: approved | clean_waiting | clean_advisory | flagged | stale | skip | missing
create or replace function public.ai_decide_chapter(cid uuid, p_verdict text, p_hash text, p_mature boolean, p_flags jsonb, p_auto boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare c public.chapters; sm boolean;
begin
  if p_verdict not in ('clean','flagged') then raise exception 'veredicto inválido'; end if;
  select * into c from public.chapters where id = cid for update;
  if not found then return 'missing'; end if;
  if public.chapter_hash(c.title, c.text) <> p_hash then return 'stale'; end if;        -- el texto cambió mientras se revisaba
  select mature into sm from public.stories where id = c.story_id;
  if sm is distinct from p_mature then return 'stale'; end if;                            -- cambió la marca +18
  if c.status <> 'pending' then return 'skip'; end if;
  insert into public.chapter_ai (chapter_id, story_id, verdict, hash, mature, flags)
  values (cid, c.story_id, p_verdict, p_hash, p_mature, p_flags)
  on conflict (chapter_id) do update set verdict = excluded.verdict, hash = excluded.hash, mature = excluded.mature, flags = excluded.flags, created_at = now();
  if p_verdict = 'flagged' then return 'flagged'; end if;
  if not p_auto then return 'clean_advisory'; end if;                                     -- modo "solo avisar": nada se aprueba solo
  if not public.prev_chapters_ok(c.story_id, c.position) then return 'clean_waiting'; end if;
  update public.chapters set status = 'approved', reason = '' where id = cid;
  return 'approved';
end $$;
revoke all on function public.ai_decide_chapter(uuid, text, text, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ai_decide_chapter(uuid, text, text, boolean, jsonb, boolean) to service_role;

-- Cuando un capítulo se aprueba (por la IA o por moderación), el siguiente que ya estaba revisado como limpio se aprueba también
create or replace function public.ai_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
declare nx public.chapters;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;
  select c.* into nx from public.chapters c
    join public.chapter_ai a on a.chapter_id = c.id and a.verdict = 'clean'
   where c.story_id = new.story_id and c.position > new.position and c.status = 'pending'
     and a.hash = public.chapter_hash(c.title, c.text)
     and a.mature = (select mature from public.stories where id = c.story_id)
   order by c.position limit 1;
  if found and public.prev_chapters_ok(nx.story_id, nx.position) then
    update public.chapters set status = 'approved', reason = '' where id = nx.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_ai_cascade on public.chapters;
create trigger trg_ai_cascade after update of status on public.chapters for each row execute function public.ai_cascade();
