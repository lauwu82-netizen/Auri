-- =====================================================================
-- AURI · Misiones, XP y pases (base)
-- Ejecutar DESPUÉS de 37_ajuste_adorno_abajo.sql, en una consulta nueva del SQL Editor.
--
-- Qué hace:
--  · Temporadas (una de prueba que empieza hoy y San Valentín 2027).
--  · Catálogo de misiones diarias y de temporada, para lector y escritor.
--  · Un registro de "eventos" que SOLO el servidor escribe (likes, comentarios, lecturas, vistas...).
--    Así nadie puede darse XP desde el teléfono: el progreso sale de lo que de verdad pasó.
--  · mission_state(): devuelve misiones, progreso, XP y nivel, y entrega el XP de lo completado.
--  · Niveles: 20. Subir del nivel 1 al 2 cuesta 100 XP y cada nivel cuesta 25 XP más que el anterior.
--  · Filtros contra trampas: capítulos de relleno no cuentan, cuentas nuevas no suman a otras,
--    vistas/lecturas/likes propios no cuentan.
-- Por ahora solo la Owner ve la pantalla (lo decide la app); la Owner tiene ambos pases de prueba.
-- =====================================================================

create table if not exists public.pass_seasons (
  id text primary key, name text not null, starts date not null, ends date not null
);
insert into public.pass_seasons (id, name, starts, ends) values
  ('prueba', 'Temporada de prueba', current_date, current_date + 27),
  ('sanvalentin-2027', 'San Valentín', '2027-02-01', '2027-02-28')
on conflict (id) do nothing;
alter table public.pass_seasons enable row level security;
drop policy if exists ps_sel on public.pass_seasons;
create policy ps_sel on public.pass_seasons for select to authenticated using (true);
revoke insert, update, delete on public.pass_seasons from anon, authenticated;

-- quién tiene cada pase (lo escribe solo la Owner con pass_grant)
create table if not exists public.pass_owned (
  uid uuid not null references public.profiles(id) on delete cascade,
  season text not null references public.pass_seasons(id) on delete cascade,
  track text not null check (track in ('reader','writer')),
  since timestamptz not null default now(),
  primary key (uid, season, track)
);
alter table public.pass_owned enable row level security;
drop policy if exists po_sel on public.pass_owned;
create policy po_sel on public.pass_owned for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.pass_owned from anon, authenticated;

create table if not exists public.missions (
  id text primary key,
  kind text not null check (kind in ('daily','season')),
  track text not null check (track in ('reader','writer')),
  tier text not null default '' check (tier in ('','easy','mid','hard')),
  evt text not null default '',
  metric text not null default 'count' check (metric in ('count','days','authors','tag','readers','daily_done')),
  goal int not null check (goal > 0),
  xp int not null check (xp > 0),
  title text not null,
  tag text not null default '',
  sort int not null default 0
);
alter table public.missions enable row level security;
drop policy if exists mi_sel on public.missions;
create policy mi_sel on public.missions for select to authenticated using (true);
revoke insert, update, delete on public.missions from anon, authenticated;

create table if not exists public.mission_events (
  id bigserial primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  ref text not null,
  meta jsonb not null default '{}',
  at timestamptz not null default now(),
  unique (uid, kind, ref)
);
create index if not exists mev_idx on public.mission_events(uid, kind, at);
alter table public.mission_events enable row level security;
revoke all on public.mission_events from anon, authenticated;

create table if not exists public.mission_claims (
  uid uuid not null references public.profiles(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  period text not null,            -- día (diarias) o id de la temporada
  season text not null references public.pass_seasons(id) on delete cascade,
  xp int not null,
  at timestamptz not null default now(),
  primary key (uid, mission_id, period)
);
alter table public.mission_claims enable row level security;
drop policy if exists mc_sel on public.mission_claims;
create policy mc_sel on public.mission_claims for select to authenticated using (uid = auth.uid());
revoke insert, update, delete on public.mission_claims from anon, authenticated;

insert into public.missions (id, kind, track, tier, evt, metric, goal, xp, title, tag, sort) values
  ('r_like3','daily','reader','easy','like','count',3,20,'Da like a 3 libros','',0),
  ('r_save1','daily','reader','easy','save','count',1,20,'Guarda un libro en tu biblioteca','',1),
  ('r_read1','daily','reader','mid','read','count',1,30,'Lee un capítulo completo','',2),
  ('r_comment1','daily','reader','mid','comment','count',1,40,'Comenta un libro con mínimo 5 palabras','',3),
  ('r_read3','daily','reader','hard','read','count',3,50,'Lee 3 capítulos','',4),
  ('r_reply1','daily','reader','hard','reply','count',1,50,'Responde un comentario','',5),
  ('r_s_read10','season','reader','','read','count',10,150,'Lee 10 capítulos','',6),
  ('r_s_read30','season','reader','','read','count',30,300,'Lee 30 capítulos','',7),
  ('r_s_read60','season','reader','','read','count',60,450,'Lee 60 capítulos','',8),
  ('r_s_read100','season','reader','','read','count',100,600,'Lee 100 capítulos','',9),
  ('r_s_comment10','season','reader','','comment','count',10,200,'Comenta en 10 libros','',10),
  ('r_s_comment25','season','reader','','comment','count',25,300,'Comenta en 25 libros','',11),
  ('r_s_comment50','season','reader','','comment','count',50,400,'Comenta en 50 libros','',12),
  ('r_s_like15','season','reader','','like','count',15,150,'Da like a 15 libros','',13),
  ('r_s_save5','season','reader','','save','count',5,100,'Guarda 5 libros en tu biblioteca','',14),
  ('r_s_follow5','season','reader','','follow','count',5,150,'Sigue a 5 autores','',15),
  ('r_s_reply10','season','reader','','reply','count',10,200,'Responde 10 comentarios','',16),
  ('r_s_days7','season','reader','','read','days',7,300,'Lee durante 7 días distintos','',17),
  ('r_s_days14','season','reader','','read','days',14,500,'Lee durante 14 días distintos','',18),
  ('r_s_auth3','season','reader','','read','authors',3,250,'Lee a 3 autores distintos','',19),
  ('r_s_romance5','season','reader','','read','tag',5,250,'Lee 5 capítulos de romance','romance',20),
  ('r_s_daily10','season','reader','','','daily_done',10,300,'Completa 10 misiones diarias','',21),
  ('r_s_daily20','season','reader','','','daily_done',20,500,'Completa 20 misiones diarias','',22),
  ('w_replyown1','daily','writer','easy','reply_own','count',1,20,'Responde un comentario de tu libro','',23),
  ('w_like2','daily','writer','easy','like','count',2,20,'Da like a 2 libros de otras personas','',24),
  ('w_view3','daily','writer','mid','view','count',3,40,'Consigue 3 vistas de personas distintas','',25),
  ('w_comment1','daily','writer','mid','comment','count',1,30,'Comenta un libro con mínimo 5 palabras','',26),
  ('w_pub1','daily','writer','hard','publish','count',1,60,'Publica un capítulo aprobado de mínimo 300 palabras','',27),
  ('w_view10','daily','writer','hard','view','count',10,50,'Consigue 10 vistas de personas distintas','',28),
  ('w_s_view10','season','writer','','view','count',10,150,'Llega a 10 vistas','',29),
  ('w_s_view50','season','writer','','view','count',50,300,'Llega a 50 vistas','',30),
  ('w_s_view100','season','writer','','view','count',100,450,'Llega a 100 vistas','',31),
  ('w_s_pub1','season','writer','','publish','count',1,100,'Publica 1 capítulo aprobado de mínimo 300 palabras','',32),
  ('w_s_pub3','season','writer','','publish','count',3,250,'Publica 3 capítulos aprobados de mínimo 300 palabras','',33),
  ('w_s_pub5','season','writer','','publish','count',5,500,'Publica 5 capítulos aprobados de mínimo 300 palabras','',34),
  ('w_s_pub10','season','writer','','publish','count',10,800,'Publica 10 capítulos aprobados de mínimo 300 palabras','',35),
  ('w_s_rd10','season','writer','','read_received','readers',10,400,'Que 10 personas distintas lean un capítulo tuyo completo','',36),
  ('w_s_rd30','season','writer','','read_received','readers',30,600,'Que 30 personas distintas lean un capítulo tuyo completo','',37),
  ('w_s_lk20','season','writer','','like_received','count',20,300,'Recibe 20 likes','',38),
  ('w_s_lk50','season','writer','','like_received','count',50,500,'Recibe 50 likes','',39),
  ('w_s_fol10','season','writer','','follower_gained','count',10,200,'Consigue 10 seguidores nuevos','',40),
  ('w_s_cm10','season','writer','','comment_received','count',10,250,'Recibe 10 comentarios','',41),
  ('w_s_daily10','season','writer','','','daily_done',10,300,'Completa 10 misiones diarias','',42),
  ('w_s_daily20','season','writer','','','daily_done',20,500,'Completa 20 misiones diarias','',43)
on conflict (id) do update set kind = excluded.kind, track = excluded.track, tier = excluded.tier, evt = excluded.evt, metric = excluded.metric,
  goal = excluded.goal, xp = excluded.xp, title = excluded.title, tag = excluded.tag, sort = excluded.sort;

-- ---------- eventos (solo el servidor) ----------
create or replace function public.ev_add(p_uid uuid, p_kind text, p_ref text, p_meta jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mission_events (uid, kind, ref, meta) values (p_uid, p_kind, p_ref, p_meta) on conflict (uid, kind, ref) do nothing;
exception when others then null;     -- nunca debe romper la acción original
end $$;
revoke all on function public.ev_add(uuid, text, text, jsonb) from public, anon, authenticated;

-- una cuenta cuenta para las misiones de otras personas si tiene 3 días o más (la Owner siempre, para poder probar)
create or replace function public.acct_ok(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'OWNER' or created_at <= now() - interval '3 days' from public.profiles where id = p_uid), false)
$$;
revoke all on function public.acct_ok(uuid) from public, anon, authenticated;

create or replace function public.words_n(t text) returns int language sql immutable as $$
  select coalesce(array_length(array(select x from unnest(regexp_split_to_array(trim(coalesce(t, '')), '\s+')) x where x <> ''), 1), 0)
$$;

-- texto "de verdad": mínimo 300 palabras, variedad de palabras, largo normal, sin letras repetidas y con vocales razonables
create or replace function public.text_ok(t text) returns boolean language plpgsql immutable as $$
declare w text[]; n int; d int; av numeric; s text; l int; v int; rep int;
begin
  s := lower(regexp_replace(coalesce(t, ''), '[^[:alpha:][:space:]]', ' ', 'g'));
  w := array(select x from unnest(regexp_split_to_array(s, '\s+')) x where x <> '');
  n := coalesce(array_length(w, 1), 0);
  if n < 300 then return false; end if;
  w := w[1:400];                                   -- la variedad se mide en una muestra de 400 palabras (en capítulos largos todo se repite más)
  select count(distinct x), avg(length(x)) into d, av from unnest(w) x;
  if d::numeric / 400 < 0.25 or av < 2.5 or av > 9 then return false; end if;
  select count(*) into rep from unnest(w) x where x ~ '(.)\1{4,}';
  if rep::numeric / 400 >= 0.05 then return false; end if;
  l := length(regexp_replace(s, '[^[:alpha:]]', '', 'g'));
  if l > 0 and length(regexp_replace(s, '[^a-záéíóúüñ]', '', 'g'))::numeric / l > 0.8 then
    v := length(regexp_replace(s, '[^aeiouáéíóúü]', '', 'g'));
    if v::numeric / l < 0.28 or v::numeric / l > 0.65 then return false; end if;
  end if;
  return true;
end $$;

-- ---------- disparadores: anotan lo que pasa de verdad ----------
create or replace function public.tg_ev_like() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from public.stories where id = new.story_id;
  if o is not null and o <> new.user_id then
    perform public.ev_add(new.user_id, 'like', new.story_id::text);
    if public.acct_ok(new.user_id) then perform public.ev_add(o, 'like_received', new.story_id::text || ':' || new.user_id::text); end if;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_like on public.likes;
create trigger mev_like after insert on public.likes for each row execute function public.tg_ev_like();

create or replace function public.tg_ev_save() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from public.stories where id = new.story_id;
  if o is not null and o <> new.user_id then perform public.ev_add(new.user_id, 'save', new.story_id::text); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_lib on public.library;
create trigger mev_lib after insert on public.library for each row execute function public.tg_ev_save();
drop trigger if exists mev_fav on public.favorites;
create trigger mev_fav after insert on public.favorites for each row execute function public.tg_ev_save();

create or replace function public.tg_ev_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ev_add(new.follower, 'follow', new.followee::text);
  if public.acct_ok(new.follower) then perform public.ev_add(new.followee, 'follower_gained', new.follower::text); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_follow on public.follows;
create trigger mev_follow after insert on public.follows for each row execute function public.tg_ev_follow();

create or replace function public.tg_ev_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if public.words_n(new.text) < 5 then return new; end if;
  select owner into o from public.stories where id = new.story_id;
  if o is null then return new; end if;
  if new.parent_id is null then
    if o <> new.user_id then
      perform public.ev_add(new.user_id, 'comment', new.id::text);
      if public.acct_ok(new.user_id) then perform public.ev_add(o, 'comment_received', new.id::text); end if;
    end if;
  else
    perform public.ev_add(new.user_id, 'reply', new.id::text);
    if o = new.user_id then perform public.ev_add(new.user_id, 'reply_own', new.id::text); end if;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_comment on public.comments;
create trigger mev_comment after insert on public.comments for each row execute function public.tg_ev_comment();

create or replace function public.tg_ev_publish() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from public.stories where id = new.story_id;
  if o is not null and public.text_ok(new.text) then perform public.ev_add(o, 'publish', new.chapter_id::text); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_publish on public.chapter_published;
create trigger mev_publish after insert or update of text on public.chapter_published for each row execute function public.tg_ev_publish();

create or replace function public.tg_ev_view() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from public.stories where id = new.story_id;
  if o is not null and o <> new.viewer and public.acct_ok(new.viewer) then perform public.ev_add(o, 'view', new.story_id::text || ':' || new.viewer::text, jsonb_build_object('u', new.viewer::text)); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists mev_view on public.story_views;
create trigger mev_view after insert on public.story_views for each row execute function public.tg_ev_view();

-- "leí un capítulo completo": la app lo avisa al llegar al final. Cada capítulo cuenta una sola vez por persona,
-- exige haber pasado un rato en la página y no vale para libros propios ni privados.
create or replace function public.mission_read(p_story uuid, p_pos int, p_secs int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid; ch uuid; tg text[]; pv boolean;
begin
  if me is null or coalesce(p_secs, 0) < 25 then return; end if;
  select owner, tags, private into o, tg, pv from public.stories where id = p_story;
  if not found or o = me or pv then return; end if;
  select chapter_id into ch from public.chapter_published where story_id = p_story and position = p_pos;
  if ch is null then return; end if;
  perform public.ev_add(me, 'read', ch::text, jsonb_build_object('s', p_story::text, 'a', o::text, 'tags', to_jsonb(coalesce(tg, '{}'::text[]))));
  if public.acct_ok(me) then perform public.ev_add(o, 'read_received', ch::text || ':' || me::text, jsonb_build_object('u', me::text)); end if;
end $$;
revoke all on function public.mission_read(uuid, int, int) from public, anon;
grant execute on function public.mission_read(uuid, int, int) to authenticated;

-- ---------- progreso, XP y niveles ----------
create or replace function public.mission_prog(p_uid uuid, m public.missions, p_from timestamptz, p_to timestamptz, p_season text) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int := 0;
begin
  if m.metric = 'count' then
    select count(*) into n from public.mission_events e where e.uid = p_uid and e.kind = m.evt and e.at >= p_from and e.at < p_to;
  elsif m.metric = 'days' then
    select count(distinct (e.at at time zone 'utc')::date) into n from public.mission_events e where e.uid = p_uid and e.kind = m.evt and e.at >= p_from and e.at < p_to;
  elsif m.metric = 'authors' then
    select count(distinct e.meta->>'a') into n from public.mission_events e where e.uid = p_uid and e.kind = m.evt and e.at >= p_from and e.at < p_to;
  elsif m.metric = 'readers' then
    select count(distinct e.meta->>'u') into n from public.mission_events e where e.uid = p_uid and e.kind = m.evt and e.at >= p_from and e.at < p_to;
  elsif m.metric = 'tag' then
    select count(*) into n from public.mission_events e where e.uid = p_uid and e.kind = m.evt and e.at >= p_from and e.at < p_to and (e.meta->'tags') ? m.tag;
  elsif m.metric = 'daily_done' then
    select count(*) into n from public.mission_claims c join public.missions mm on mm.id = c.mission_id
      where c.uid = p_uid and c.season = p_season and mm.kind = 'daily' and mm.track = m.track;
  end if;
  return coalesce(n, 0);
end $$;
revoke all on function public.mission_prog(uuid, public.missions, timestamptz, timestamptz, text) from public, anon, authenticated;

-- XP acumulado necesario para llegar al nivel n (nivel 1 = 0 XP)
create or replace function public.level_xp(n int) returns int language sql immutable as $$
  select case when n <= 1 then 0 else 100 * (n - 1) + 25 * ((n - 1) * (n - 2) / 2) end
$$;

create or replace function public.mission_state(p_track text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); s public.pass_seasons; today date := (now() at time zone 'utc')::date;
  m public.missions; pr int; d_from timestamptz; d_to timestamptz; s_from timestamptz; s_to timestamptz;
  items jsonb := '[]'::jsonb; fresh jsonb := '[]'::jsonb; ins int; xp int; lv int := 1; owned boolean; per text; fr timestamptz; to_ timestamptz;
begin
  if me is null then return null; end if;
  if p_track not in ('reader','writer') then raise exception 'Pista no válida'; end if;
  select * into s from public.pass_seasons where today between starts and ends order by starts desc limit 1;
  if not found then return jsonb_build_object('season', null); end if;
  d_from := today::timestamp at time zone 'utc'; d_to := d_from + interval '1 day';
  s_from := s.starts::timestamp at time zone 'utc'; s_to := (s.ends + 1)::timestamp at time zone 'utc';
  for m in
    select * from public.missions mm where mm.track = p_track and mm.kind = 'season'
    union all
    select * from (select distinct on (tier) * from public.missions mm where mm.track = p_track and mm.kind = 'daily' order by tier, md5(me::text || today::text || mm.id)) q
    order by 2, 3, 11
  loop
    if m.kind = 'daily' then per := today::text; fr := d_from; to_ := d_to; else per := s.id; fr := s_from; to_ := s_to; end if;
    pr := public.mission_prog(me, m, fr, to_, s.id);
    if pr >= m.goal then
      insert into public.mission_claims (uid, mission_id, period, season, xp) values (me, m.id, per, s.id, m.xp) on conflict do nothing;
      get diagnostics ins = row_count;
      if ins > 0 then fresh := fresh || jsonb_build_array(jsonb_build_object('id', m.id, 'title', m.title, 'xp', m.xp)); end if;
    end if;
    items := items || jsonb_build_array(jsonb_build_object('id', m.id, 'kind', m.kind, 'tier', m.tier, 'title', m.title, 'goal', m.goal, 'xp', m.xp,
      'progress', least(pr, m.goal), 'done', pr >= m.goal));
  end loop;
  select coalesce(sum(c.xp), 0) into xp from public.mission_claims c join public.missions mm on mm.id = c.mission_id
    where c.uid = me and c.season = s.id and mm.track = p_track;
  while lv < 20 and public.level_xp(lv + 1) <= xp loop lv := lv + 1; end loop;
  owned := public.is_owner() or exists (select 1 from public.pass_owned where uid = me and season = s.id and track = p_track);
  return jsonb_build_object('season', jsonb_build_object('id', s.id, 'name', s.name, 'starts', s.starts, 'ends', s.ends), 'owned', owned, 'xp', xp, 'level', lv,
    'floor', public.level_xp(lv), 'next', case when lv >= 20 then null else public.level_xp(lv + 1) end, 'max', 20, 'missions', items, 'new', fresh);
end $$;
revoke all on function public.mission_state(text) from public, anon;
grant execute on function public.mission_state(text) to authenticated;

-- la Owner regala un pase de una temporada
create or replace function public.pass_grant(p_user uuid, p_season text, p_track text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Solo la Owner'; end if;
  insert into public.pass_owned (uid, season, track) values (p_user, p_season, p_track) on conflict do nothing;
end $$;
revoke all on function public.pass_grant(uuid, text, text) from public, anon;
grant execute on function public.pass_grant(uuid, text, text) to authenticated;
