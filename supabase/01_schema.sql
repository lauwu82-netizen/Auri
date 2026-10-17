-- =====================================================================
-- AURI · Esquema inicial de Supabase (versión 1)
-- Pégalo completo en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin romper lo que ya exista.
-- =====================================================================

-- ---------- 1. FUNCIONES AUXILIARES (permisos por rol) ----------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null default 'Usuario',
  community      text not null default 'es' check (community in ('es','en')),
  bio            text not null default '',
  avatar         text not null default '',
  banner         text not null default '',
  role           text not null default 'USER' check (role in ('USER','MODERATOR','ADMIN','OWNER')),
  scope          text[] not null default '{}',       -- comunidades que modera (es / en)
  frame_worn     boolean not null default false,     -- marco de rol puesto
  frame_top      boolean not null default false,     -- marco Top 50 reclamado
  mod_since      date,
  adm_since      date,
  terms_accepted date,
  created_at     timestamptz not null default now()
);

create table if not exists public.profile_private (
  id          uuid primary key references public.profiles(id) on delete cascade,
  email       text,
  birth       date,
  gender      text,
  interests   text[] not null default '{}',
  onboarded   boolean not null default false
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select role from public.profiles where id = auth.uid()), 'USER') $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select public.my_role() in ('MODERATOR','ADMIN','OWNER') $$;

create or replace function public.is_admin_plus() returns boolean
language sql stable security definer set search_path = public as
$$ select public.my_role() in ('ADMIN','OWNER') $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select public.my_role() = 'OWNER' $$;

-- la Owner ve todas las comunidades; el resto del equipo, solo las suyas
create or replace function public.in_scope(comm text) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_owner() or (public.is_staff() and comm = any (coalesce((select scope from public.profiles where id = auth.uid()), '{}'::text[]))) $$;

create or replace function public.is_adult(uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select age(birth) >= interval '18 years' from public.profile_private where id = uid), false) $$;

create or replace function public.viewer_adult() returns boolean
language sql stable security definer set search_path = public as
$$ select case when auth.uid() is null then false else public.is_adult(auth.uid()) end $$;

-- ---------- 2. CUENTAS --------------------------------------------------
-- Al crear una cuenta en Supabase Auth se crea su perfil automáticamente.
-- La Owner NO se asigna aquí: se hace a mano (ver 02_owner.sql).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, name, community, terms_accepted)
  values (new.id, left(coalesce(nullif(m->>'name',''), split_part(new.email,'@',1)), 40),
          case when m->>'community' = 'en' then 'en' else 'es' end, current_date);
  insert into public.profile_private (id, email, birth, gender, interests, onboarded)
  values (new.id, new.email,
          nullif(m->>'birth','')::date, m->>'gender',
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(m->'interests','[]'::jsonb)) x), '{}'),
          true);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- nadie se cambia a sí mismo el rol, los marcos de equipo ni las comunidades que modera
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('auri.bypass', true) = '1' or public.is_owner() then return new; end if;
  if new.role is distinct from old.role or new.scope is distinct from old.scope
     or new.frame_top is distinct from old.frame_top or new.mod_since is distinct from old.mod_since
     or new.adm_since is distinct from old.adm_since or new.id is distinct from old.id then
    raise exception 'No tienes permiso para cambiar eso';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------- 3. HISTORIAS Y CAPÍTULOS -----------------------------------
create table if not exists public.stories (
  id        uuid primary key default gen_random_uuid(),
  owner     uuid not null references public.profiles(id) on delete cascade,
  community text not null default 'es' check (community in ('es','en')),
  title     text not null,
  synopsis  text not null default '',
  genre     text not null default '',
  fandom    text not null default '',
  tags      text[] not null default '{}',
  cover     text not null default '',
  cover_pos jsonb,
  mature    boolean not null default false,
  phase     text not null default 'ongoing' check (phase in ('ongoing','paused','finished')),
  prev      uuid references public.stories(id) on delete set null,   -- parte anterior de la saga
  use_reader_character boolean not null default true,
  terms     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stories_owner_idx on public.stories(owner);

-- versión de trabajo de la autoría (la que se revisa)
create table if not exists public.chapters (
  id        uuid primary key default gen_random_uuid(),
  story_id  uuid not null references public.stories(id) on delete cascade,
  position  int  not null,
  title     text not null default '',
  text      text not null default '',
  cover     text not null default '',
  music     text not null default '',
  status    text not null default 'pending' check (status in ('draft','pending','rejected','approved')),
  reason    text not null default '',
  updated_at timestamptz not null default now(),
  unique (story_id, position)
);

-- versión que leen las personas (solo lo aprobado)
create table if not exists public.chapter_published (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  story_id   uuid not null references public.stories(id) on delete cascade,
  position   int  not null,
  title      text not null,
  text       text not null,
  cover      text not null default '',
  music      text not null default '',
  published_at timestamptz not null default now()
);
create index if not exists chpub_story_idx on public.chapter_published(story_id, position);

create table if not exists public.takedowns (
  story_id uuid primary key references public.stories(id) on delete cascade,
  by uuid references public.profiles(id), date timestamptz not null default now()
);

create or replace function public.story_public(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stories s
                 where s.id = sid
                   and exists (select 1 from public.chapter_published p where p.story_id = s.id)
                   and not exists (select 1 from public.takedowns t where t.story_id = s.id)
                   and (not s.mature or public.viewer_adult()))
$$;

create or replace function public.story_owner(sid uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select owner from public.stories where id = sid $$;

create or replace function public.story_comm(sid uuid) returns text
language sql stable security definer set search_path = public as
$$ select community from public.stories where id = sid $$;

-- quien no es dueña de la historia solo puede cambiar la marca +18 (equipo)
create or replace function public.guard_story() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and auth.uid() <> old.owner and not public.is_owner() then
    if new.owner is distinct from old.owner or new.title is distinct from old.title
       or new.synopsis is distinct from old.synopsis or new.cover is distinct from old.cover
       or new.community is distinct from old.community then
      raise exception 'Solo la autoría puede editar la historia';
    end if;
  end if;
  if new.owner is distinct from old.owner then raise exception 'No se puede cambiar la autoría'; end if;
  return new;
end $$;
drop trigger if exists trg_guard_story on public.stories;
create trigger trg_guard_story before update on public.stories for each row execute function public.guard_story();

-- reglas de estado de los capítulos
create or replace function public.guard_chapter() returns trigger
language plpgsql security definer set search_path = public as $$
declare so uuid; ok boolean;
begin
  if tg_op = 'INSERT' then
    if not public.is_owner() then new.status := case when new.status = 'draft' then 'draft' else 'pending' end; end if;
    return new;
  end if;
  so := public.story_owner(old.story_id);
  new.updated_at := now();
  if auth.uid() is null then return new; end if;
  if auth.uid() = so then
    -- la autoría: cualquier cambio de contenido vuelve a revisión; no puede aprobarse sola (salvo la Owner)
    if not public.is_owner() then
      if new.status in ('approved','rejected') and new.status is distinct from old.status then
        raise exception 'Solo el equipo puede aprobar o rechazar';
      end if;
      if (new.title, new.text, new.cover, new.music) is distinct from (old.title, old.text, old.cover, old.music) and new.status <> 'draft' then
        new.status := 'pending'; new.reason := '';
      end if;
    end if;
  else
    -- el equipo: solo estado y motivo; no revisa sus propios capítulos (salvo la Owner)
    if (new.title, new.text, new.cover, new.music, new.position) is distinct from (old.title, old.text, old.cover, old.music, old.position) then
      raise exception 'El equipo no puede editar el texto';
    end if;
  end if;
  -- los capítulos se aprueban en orden
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select not exists (
      select 1 from public.chapters c
      where c.story_id = new.story_id and c.position < new.position
        and not exists (select 1 from public.chapter_published p where p.chapter_id = c.id)
        and c.status <> 'approved'
    ) into ok;
    if not ok then raise exception 'Aprueba antes los capítulos anteriores'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_chapter on public.chapters;
create trigger trg_guard_chapter before insert or update on public.chapters for each row execute function public.guard_chapter();

-- al aprobar se copia la versión a la que ven las personas lectoras
create or replace function public.publish_chapter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' then
    insert into public.chapter_published (chapter_id, story_id, position, title, text, cover, music)
    values (new.id, new.story_id, new.position, new.title, new.text, new.cover, new.music)
    on conflict (chapter_id) do update set position = excluded.position, title = excluded.title, text = excluded.text,
      cover = excluded.cover, music = excluded.music, published_at = now();
  end if;
  return new;
end $$;
drop trigger if exists trg_publish_chapter on public.chapters;
create trigger trg_publish_chapter after insert or update on public.chapters for each row execute function public.publish_chapter();

-- ---------- 4. SOCIAL -----------------------------------------------------
create table if not exists public.follows (
  follower uuid not null references public.profiles(id) on delete cascade,
  followee uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee), check (follower <> followee)
);
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  primary key (user_id, story_id)
);
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  primary key (user_id, story_id)
);
create table if not exists public.library (
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create table if not exists public.subscriptions (      -- avisos de capítulos nuevos
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  primary key (user_id, story_id)
);
create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('block','mute')),
  primary key (blocker, blocked, kind), check (blocker <> blocked)
);
-- datos personales de cada cuenta que no necesitan consultas entre personas
-- (ajustes, progreso de lectura, colecciones, personajes lectores, borradores de escritura…)
create table if not exists public.user_data (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null, value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  text text not null check (length(text) between 1 and 2000),
  edited boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_story_idx on public.comments(story_id, created_at);
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (comment_id, user_id)
);
create table if not exists public.paragraph_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  chapter_pos int not null, para_idx int not null, q text not null default '',
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.paragraph_comments(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000),
  spoiler boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pcom_story_idx on public.paragraph_comments(story_id, chapter_pos, para_idx);
create table if not exists public.paragraph_comment_likes (
  comment_id uuid not null references public.paragraph_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (comment_id, user_id)
);

-- ---------- 5. MENSAJES Y AVISOS ---------------------------------------
create or replace function public.can_dm(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b
    and exists (select 1 from public.follows where follower = a and followee = b)
    and exists (select 1 from public.follows where follower = b and followee = a)
    and public.is_adult(a) = public.is_adult(b)                      -- mismo rango de edad
    and not exists (select 1 from public.blocks where kind = 'block' and ((blocker = a and blocked = b) or (blocker = b and blocked = a)))
$$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  text text not null default '' check (length(text) <= 2000),
  story_id uuid references public.stories(id) on delete set null,   -- obra recomendada
  img text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists messages_pair_idx on public.messages(sender, recipient, created_at);
create table if not exists public.dm_read (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
-- fotos solo entre personas adultas
create or replace function public.guard_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.img <> '' and not (public.is_adult(new.sender) and public.is_adult(new.recipient)) then
    raise exception 'Las fotos solo se pueden enviar entre personas mayores de edad';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_message on public.messages;
create trigger trg_guard_message before insert on public.messages for each row execute function public.guard_message();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,                           -- follow, like, comment, reply, clike, chapter, review, approved, rejected, strike, modinvite, sys
  from_user uuid references public.profiles(id) on delete set null,
  story_id uuid references public.stories(id) on delete set null,
  chap text not null default '', extra text not null default '',
  xv jsonb, href text, role text, done text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id, created_at desc);

-- ---------- 6. MODERACIÓN ------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  by uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('story','comment','pcomment','user','problem','reclass')),
  story_id uuid references public.stories(id) on delete set null,
  comment_id uuid, chapter_pos int,
  target uuid references public.profiles(id) on delete set null,   -- cuenta reportada
  owner uuid references public.profiles(id) on delete set null,
  title text not null default '', excerpt text not null default '',
  reasons text[] not null default '{}', text text not null default '',
  imgs text[] not null default '{}',
  community text not null default 'es',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  handled_by uuid references public.profiles(id) on delete set null, handled_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.report_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new."by" := auth.uid(); new.status := 'open'; new.handled_by := null; new.handled_at := null;
  new.community := coalesce((select community from public.profiles where id = coalesce(new.owner, new.target, new."by")), 'es');
  return new;
end $$;
drop trigger if exists trg_report_defaults on public.reports;
create trigger trg_report_defaults before insert on public.reports for each row execute function public.report_defaults();

create table if not exists public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null, by uuid references public.profiles(id) on delete set null,
  void boolean not null default false, void_reason text not null default '',
  void_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null, by uuid references public.profiles(id) on delete set null,
  until timestamptz,                           -- null = permanente
  created_at timestamptz not null default now()
);
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ban_date timestamptz not null,
  ban_reason text not null default '', ban_by uuid references public.profiles(id) on delete set null, ban_until timestamptz,
  text text not null check (length(text) between 10 and 1000),
  imgs text[] not null default '{}',
  status text not null default 'open' check (status in ('open','released','rejected')),
  handled_by uuid references public.profiles(id) on delete set null, handled_at timestamptz, note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'top50',
  to_user uuid not null references public.profiles(id) on delete cascade,
  by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','claimed','expired','revoked')),
  expires_at timestamptz not null default now() + interval '24 hours',
  claimed_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.guard_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.gifts where status in ('pending','claimed')) >= 53 then
    raise exception 'Ya no quedan cupos del marco Top 50';
  end if;
  if exists (select 1 from public.gifts where to_user = new.to_user and status in ('pending','claimed')) then
    raise exception 'Esa persona ya tiene el marco o un regalo pendiente';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_gift on public.gifts;
create trigger trg_guard_gift before insert on public.gifts for each row execute function public.guard_gift();

create table if not exists public.modlog (
  id uuid primary key default gen_random_uuid(),
  type text not null, by uuid references public.profiles(id) on delete set null,
  target text not null default '', extra text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists modlog_date_idx on public.modlog(created_at desc);

-- ---------- 7. NOTICIAS Y BANNER ---------------------------------------
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Anuncio', title text not null, text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  by uuid references public.profiles(id) on delete set null,
  by_role text not null default 'OWNER', anon boolean not null default false,
  comm text not null default 'all' check (comm in ('all','es','en')),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  reason text not null default '',
  created_at timestamptz not null default now(), edited_at timestamptz
);
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('book','event')),
  story_id uuid references public.stories(id) on delete cascade,
  news_id uuid references public.news(id) on delete set null,
  title text not null default '', text text not null default '', btn text not null default '',
  by uuid references public.profiles(id) on delete set null,
  by_role text not null default 'OWNER', anon boolean not null default false,
  comm text not null default 'all' check (comm in ('all','es','en')),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  reason text not null default '', position int not null default 0,
  created_at timestamptz not null default now(), edited_at timestamptz
);
create table if not exists public.news_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'Actualización', title text not null default '',
  blocks jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now()
);
-- el equipo de moderación publica en revisión; Administración y Owner publican directo
create or replace function public.guard_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new."by" := coalesce(new."by", auth.uid());
  new.by_role := public.my_role();
  if public.my_role() = 'MODERATOR' then new.status := 'pending'; new.reason := ''; end if;
  return new;
end $$;
drop trigger if exists trg_guard_news on public.news;
create trigger trg_guard_news before insert on public.news for each row execute function public.guard_post();
drop trigger if exists trg_guard_banner on public.banners;
create trigger trg_guard_banner before insert on public.banners for each row execute function public.guard_post();

create or replace function public.guard_post_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'MODERATOR' and new.status is distinct from old.status and new.status <> 'pending' then
    raise exception 'Solo Administración y Owner aprueban publicaciones';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_news_u on public.news;
create trigger trg_guard_news_u before update on public.news for each row execute function public.guard_post_update();
drop trigger if exists trg_guard_banner_u on public.banners;
create trigger trg_guard_banner_u before update on public.banners for each row execute function public.guard_post_update();

-- ---------- 8. FUNCIONES DE EQUIPO (acciones con permisos) -------------
-- Buscar una cuenta por nombre o correo (solo Administración y Owner)
create or replace function public.find_user(q text) returns table (id uuid, name text, community text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.community from public.profiles p join public.profile_private pp on pp.id = p.id
  where public.is_admin_plus() and (lower(pp.email) = lower(trim(q)) or lower(p.name) = lower(trim(q))) limit 5
$$;

-- La Owner invita a moderación o administración
create or replace function public.invite_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede hacer ascensos'; end if;
  if new_role not in ('MODERATOR','ADMIN') then raise exception 'Rol no válido'; end if;
  if new_role = 'MODERATOR' and not public.is_adult(target) then raise exception 'Solo personas mayores de 18 años pueden ser parte del equipo'; end if;
  if new_role = 'ADMIN' and (select role from public.profiles where id = target) <> 'MODERATOR' then raise exception 'Solo una persona moderadora puede ascender a administración'; end if;
  if exists (select 1 from public.notifications where user_id = target and type = 'modinvite' and done is null) then raise exception 'Ya tiene una invitación pendiente'; end if;
  insert into public.notifications (user_id, type, from_user, role) values (target, 'modinvite', auth.uid(), new_role);
  insert into public.modlog (type, by, target) values ('invite-' || lower(new_role), auth.uid(), target::text);
end $$;

create or replace function public.answer_invite(nid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id = nid and user_id = auth.uid() and type = 'modinvite' and done is null;
  if not found then raise exception 'Esta invitación ya no está disponible'; end if;
  if accept then
    if not public.is_adult(auth.uid()) then raise exception 'Tu cuenta no puede aceptar esta invitación'; end if;
    perform set_config('auri.bypass', '1', true);
    update public.profiles set role = n.role, frame_worn = true,
      scope = case when scope = '{}' then array[community] else scope end,
      mod_since = case when n.role = 'MODERATOR' then current_date else mod_since end,
      adm_since = case when n.role = 'ADMIN' then current_date else adm_since end
    where id = auth.uid();
    perform set_config('auri.bypass', '0', true);
  end if;
  update public.notifications set done = case when accept then 'accepted' else 'declined' end, read = true where id = nid;
  insert into public.notifications (user_id, type, extra, xv)
  values (n.from_user, 'sys',
    case when accept then '{n} aceptó tu invitación y ya es parte del equipo.' else '{n} rechazó la invitación.' end,
    jsonb_build_object('n', (select name from public.profiles where id = auth.uid())));
  insert into public.modlog (type, by, target) values (case when accept then 'accept-' else 'decline-' end || lower(n.role), auth.uid(), auth.uid()::text);
end $$;

-- Descender: la Owner (Administración→Moderación, Moderación→usuaria) o Administración (Moderación→usuaria)
create or replace function public.revoke_role(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tr text := (select role from public.profiles where id = target);
begin
  if target = auth.uid() then raise exception 'No tienes permiso para esta acción'; end if;
  if not (case when public.is_owner() then tr in ('MODERATOR','ADMIN') when public.my_role() = 'ADMIN' then tr = 'MODERATOR' else false end)
    then raise exception 'No tienes permiso para esta acción'; end if;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set role = case when tr = 'ADMIN' then 'MODERATOR' else 'USER' end,
    frame_worn = (tr = 'ADMIN'), scope = case when tr = 'ADMIN' then scope else '{}' end,
    adm_since = null, mod_since = case when tr = 'ADMIN' then mod_since else null end
  where id = target;
  perform set_config('auri.bypass', '0', true);
  insert into public.notifications (user_id, type, extra)
  values (target, 'sys', case when tr = 'ADMIN' then 'Tu rol de administración ha finalizado: sigues en el equipo de moderación.' else 'Tu participación en el equipo de moderación de Auri Studios ha finalizado.' end);
  insert into public.modlog (type, by, target) values ('revoke-' || lower(tr), auth.uid(), target::text);
end $$;

-- Reclamar un regalo (la persona que lo recibe)
create or replace function public.gift_claim(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.gifts;
begin
  select * into g from public.gifts where id = gid and to_user = auth.uid() for update;
  if not found then raise exception 'Ese regalo no es tuyo'; end if;
  if g.status <> 'pending' then raise exception 'Este regalo ya no está disponible'; end if;
  if g.expires_at <= now() then
    update public.gifts set status = 'expired', ended_at = now() where id = gid;
    raise exception 'Este regalo venció: pasaron 24 h sin reclamarlo';
  end if;
  update public.gifts set status = 'claimed', claimed_at = now() where id = gid;
  perform set_config('auri.bypass', '1', true);
  update public.profiles set frame_top = true where id = auth.uid();
  perform set_config('auri.bypass', '0', true);
  insert into public.notifications (user_id, type, extra, xv)
  values (g."by", 'sys', '{n} reclamó su marco Top 50.', jsonb_build_object('n', (select name from public.profiles where id = auth.uid())));
  insert into public.modlog (type, by, target) values ('gift-claim', auth.uid(), auth.uid()::text);
end $$;

-- Marca como vencidos los regalos sin reclamar (cualquiera puede llamarla; es idempotente)
create or replace function public.gifts_sweep() returns void
language sql security definer set search_path = public as
$$ update public.gifts set status = 'expired', ended_at = now() where status = 'pending' and expires_at <= now() $$;

-- Cuenta suspendida activa
create or replace function public.active_ban(uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.bans where user_id = uid and (until is null or until > now())) $$;

-- Eliminar la propia cuenta y todos sus datos
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if public.my_role() = 'OWNER' then raise exception 'La cuenta Owner no se puede eliminar desde aquí'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- 9. SEGURIDAD (RLS: quién ve y cambia qué) -------------------
do $$ declare t text; begin
  for t in select unnest(array['profiles','profile_private','stories','chapters','chapter_published','takedowns','follows','likes','favorites','library','subscriptions','blocks','user_data','comments','comment_likes','paragraph_comments','paragraph_comment_likes','messages','dm_read','notifications','reports','strikes','bans','appeals','gifts','modlog','news','banners','news_drafts'])
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- perfiles
drop policy if exists p_sel on public.profiles;           create policy p_sel on public.profiles for select using (true);
drop policy if exists p_upd on public.profiles;           create policy p_upd on public.profiles for update to authenticated using (id = auth.uid() or public.is_owner()) with check (id = auth.uid() or public.is_owner());
drop policy if exists pp_sel on public.profile_private;   create policy pp_sel on public.profile_private for select to authenticated using (id = auth.uid() or public.is_admin_plus());
drop policy if exists pp_upd on public.profile_private;   create policy pp_upd on public.profile_private for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- historias
drop policy if exists s_sel on public.stories;
create policy s_sel on public.stories for select using (owner = auth.uid() or public.in_scope(community) or public.story_public(id));
drop policy if exists s_ins on public.stories;
create policy s_ins on public.stories for insert to authenticated with check (owner = auth.uid() and not public.active_ban(auth.uid()));
drop policy if exists s_upd on public.stories;
create policy s_upd on public.stories for update to authenticated using (owner = auth.uid() or public.in_scope(community)) with check (owner = auth.uid() or public.in_scope(community));
drop policy if exists s_del on public.stories;
create policy s_del on public.stories for delete to authenticated using (owner = auth.uid() or public.is_owner());

drop policy if exists c_sel on public.chapters;
create policy c_sel on public.chapters for select to authenticated using (public.story_owner(story_id) = auth.uid() or public.in_scope(public.story_comm(story_id)));
drop policy if exists c_ins on public.chapters;
create policy c_ins on public.chapters for insert to authenticated with check (public.story_owner(story_id) = auth.uid());
drop policy if exists c_upd on public.chapters;
create policy c_upd on public.chapters for update to authenticated using (public.story_owner(story_id) = auth.uid() or public.in_scope(public.story_comm(story_id)));
drop policy if exists c_del on public.chapters;
create policy c_del on public.chapters for delete to authenticated using (public.story_owner(story_id) = auth.uid());

drop policy if exists cp_sel on public.chapter_published;
create policy cp_sel on public.chapter_published for select using (public.story_public(story_id) or public.story_owner(story_id) = auth.uid() or public.in_scope(public.story_comm(story_id)));

drop policy if exists td_sel on public.takedowns;  create policy td_sel on public.takedowns for select using (true);
drop policy if exists td_w on public.takedowns;    create policy td_w on public.takedowns for all to authenticated using (public.in_scope(public.story_comm(story_id))) with check (public.in_scope(public.story_comm(story_id)));

-- social
drop policy if exists f_sel on public.follows;     create policy f_sel on public.follows for select using (true);
drop policy if exists f_ins on public.follows;     create policy f_ins on public.follows for insert to authenticated with check (follower = auth.uid());
drop policy if exists f_del on public.follows;     create policy f_del on public.follows for delete to authenticated using (follower = auth.uid());
drop policy if exists l_sel on public.likes;       create policy l_sel on public.likes for select using (true);
drop policy if exists l_ins on public.likes;       create policy l_ins on public.likes for insert to authenticated with check (user_id = auth.uid() and public.story_public(story_id));
drop policy if exists l_del on public.likes;       create policy l_del on public.likes for delete to authenticated using (user_id = auth.uid());
do $$ declare t text; begin
  foreach t in array array['favorites','library','subscriptions','user_data','dm_read','news_drafts'] loop
    execute format('drop policy if exists own_all on public.%I', t);
    execute format('create policy own_all on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
drop policy if exists b_all on public.blocks;      create policy b_all on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

drop policy if exists cm_sel on public.comments;
create policy cm_sel on public.comments for select using (public.story_public(story_id) or public.story_owner(story_id) = auth.uid() or public.is_staff());
drop policy if exists cm_ins on public.comments;
create policy cm_ins on public.comments for insert to authenticated with check (user_id = auth.uid() and public.story_public(story_id) and not public.active_ban(auth.uid()));
drop policy if exists cm_upd on public.comments;
create policy cm_upd on public.comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cm_del on public.comments;
create policy cm_del on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists cl_sel on public.comment_likes;   create policy cl_sel on public.comment_likes for select using (true);
drop policy if exists cl_ins on public.comment_likes;   create policy cl_ins on public.comment_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists cl_del on public.comment_likes;   create policy cl_del on public.comment_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists pc_sel on public.paragraph_comments;
create policy pc_sel on public.paragraph_comments for select using (public.story_public(story_id) or public.story_owner(story_id) = auth.uid() or public.is_staff());
drop policy if exists pc_ins on public.paragraph_comments;
create policy pc_ins on public.paragraph_comments for insert to authenticated with check (user_id = auth.uid() and public.story_public(story_id) and not public.active_ban(auth.uid()));
drop policy if exists pc_upd on public.paragraph_comments;
create policy pc_upd on public.paragraph_comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists pc_del on public.paragraph_comments;
create policy pc_del on public.paragraph_comments for delete to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists pcl_sel on public.paragraph_comment_likes; create policy pcl_sel on public.paragraph_comment_likes for select using (true);
drop policy if exists pcl_ins on public.paragraph_comment_likes; create policy pcl_ins on public.paragraph_comment_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists pcl_del on public.paragraph_comment_likes; create policy pcl_del on public.paragraph_comment_likes for delete to authenticated using (user_id = auth.uid());

-- mensajes y avisos
drop policy if exists m_sel on public.messages; create policy m_sel on public.messages for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
drop policy if exists m_ins on public.messages; create policy m_ins on public.messages for insert to authenticated with check (sender = auth.uid() and public.can_dm(sender, recipient));
drop policy if exists n_sel on public.notifications; create policy n_sel on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists n_ins on public.notifications; create policy n_ins on public.notifications for insert to authenticated with check (from_user = auth.uid() or public.is_staff());
drop policy if exists n_upd on public.notifications; create policy n_upd on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists n_del on public.notifications; create policy n_del on public.notifications for delete to authenticated using (user_id = auth.uid());

-- moderación
drop policy if exists r_ins on public.reports; create policy r_ins on public.reports for insert to authenticated with check (true);   -- el campo "by" se fija solo
drop policy if exists r_sel on public.reports; create policy r_sel on public.reports for select to authenticated using (by = auth.uid() or public.in_scope(community));
drop policy if exists r_upd on public.reports; create policy r_upd on public.reports for update to authenticated using (public.in_scope(community));
drop policy if exists r_del on public.reports; create policy r_del on public.reports for delete to authenticated using (public.is_admin_plus());

drop policy if exists st_sel on public.strikes; create policy st_sel on public.strikes for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists st_ins on public.strikes; create policy st_ins on public.strikes for insert to authenticated with check (public.is_staff() and user_id <> auth.uid() and by = auth.uid());
drop policy if exists st_upd on public.strikes; create policy st_upd on public.strikes for update to authenticated using (public.is_admin_plus());
drop policy if exists bn_sel on public.bans;    create policy bn_sel on public.bans for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists bn_w on public.bans;      create policy bn_w on public.bans for all to authenticated using (public.is_admin_plus()) with check (public.is_admin_plus() and user_id <> auth.uid());

drop policy if exists ap_ins on public.appeals; create policy ap_ins on public.appeals for insert to authenticated with check (user_id = auth.uid() and public.active_ban(auth.uid()));
drop policy if exists ap_sel on public.appeals; create policy ap_sel on public.appeals for select to authenticated using (user_id = auth.uid() or public.is_admin_plus());
drop policy if exists ap_upd on public.appeals; create policy ap_upd on public.appeals for update to authenticated using (public.is_admin_plus());

drop policy if exists g_sel on public.gifts; create policy g_sel on public.gifts for select to authenticated using (to_user = auth.uid() or public.is_owner());
drop policy if exists g_w on public.gifts;   create policy g_w on public.gifts for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists ml_sel on public.modlog; create policy ml_sel on public.modlog for select to authenticated using (public.is_owner());
drop policy if exists ml_ins on public.modlog; create policy ml_ins on public.modlog for insert to authenticated with check (public.is_staff() and by = auth.uid());

-- noticias y banner
drop policy if exists nw_sel on public.news;
create policy nw_sel on public.news for select using ((status = 'approved' and (comm = 'all' or comm = coalesce((select community from public.profiles where id = auth.uid()), comm))) or by = auth.uid() or public.is_admin_plus());
drop policy if exists nw_ins on public.news; create policy nw_ins on public.news for insert to authenticated with check (public.is_staff());
drop policy if exists nw_upd on public.news; create policy nw_upd on public.news for update to authenticated using (public.is_owner() or public.is_admin_plus() or by = auth.uid());
drop policy if exists nw_del on public.news; create policy nw_del on public.news for delete to authenticated using (public.is_owner() or by = auth.uid());
drop policy if exists bnr_sel on public.banners;
create policy bnr_sel on public.banners for select using ((status = 'approved' and (comm = 'all' or comm = coalesce((select community from public.profiles where id = auth.uid()), comm))) or by = auth.uid() or public.is_admin_plus());
drop policy if exists bnr_ins on public.banners; create policy bnr_ins on public.banners for insert to authenticated with check (public.is_staff());
drop policy if exists bnr_upd on public.banners; create policy bnr_upd on public.banners for update to authenticated using (public.is_owner() or public.is_admin_plus() or by = auth.uid());
drop policy if exists bnr_del on public.banners; create policy bnr_del on public.banners for delete to authenticated using (public.is_owner() or by = auth.uid());

-- permisos de las funciones que la página puede llamar
revoke all on function public.find_user(text), public.invite_role(uuid,text), public.answer_invite(uuid,boolean), public.revoke_role(uuid),
  public.gift_claim(uuid), public.gifts_sweep(), public.delete_my_account() from public, anon;
grant execute on function public.find_user(text), public.invite_role(uuid,text), public.answer_invite(uuid,boolean), public.revoke_role(uuid),
  public.gift_claim(uuid), public.gifts_sweep(), public.delete_my_account() to authenticated;
