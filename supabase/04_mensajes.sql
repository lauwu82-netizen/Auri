-- =====================================================================
-- Auri Studios · Paso 3: mensajes y avisos
--   Menores de 18: se siguen mutuamente (igual que antes).
--   Mayores de edad: SOLICITUD de mensaje (un único mensaje de texto, sin fotos
--   ni enlaces). Quien la recibe puede aceptar, rechazar (sin avisar) o bloquear.
-- Se ejecuta UNA vez en el SQL Editor de Supabase (se puede repetir sin problema).
-- =====================================================================

-- ---------- solicitudes de mensaje ----------
create table if not exists public.dm_requests (
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (sender, recipient), check (sender <> recipient)
);
create index if not exists dm_req_rec_idx on public.dm_requests(recipient, status);
alter table public.dm_requests enable row level security;
drop policy if exists dr_sel on public.dm_requests;
create policy dr_sel on public.dm_requests for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
-- no hay políticas de escritura: las solicitudes se crean con el mensaje (trigger) y se responden con answer_dm_request()

-- ---------- ¿pueden escribirse? ----------
create or replace function public.dm_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where kind = 'block' and ((blocker = a and blocked = b) or (blocker = b and blocked = a)))
$$;

create or replace function public.can_dm(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and not public.dm_blocked(a, b) and (
    -- menores: seguimiento mutuo
    (not public.is_adult(a) and not public.is_adult(b)
      and exists (select 1 from public.follows where follower = a and followee = b)
      and exists (select 1 from public.follows where follower = b and followee = a))
    or
    -- mayores de edad: solicitud aceptada (en cualquier sentido)
    (public.is_adult(a) and public.is_adult(b)
      and exists (select 1 from public.dm_requests where status = 'accepted' and ((sender = a and recipient = b) or (sender = b and recipient = a))))
  )
$$;

-- ---------- guarda de mensajes (fotos y solicitudes) ----------
create or replace function public.guard_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text := lower(coalesce(new.text, ''));
begin
  if auth.uid() is null then return new; end if;                       -- SQL Editor / servicio
  if new.sender <> auth.uid() then raise exception 'No puedes enviar mensajes por otra persona'; end if;
  if new.img <> '' and not (public.is_adult(new.sender) and public.is_adult(new.recipient)) then
    raise exception 'Las fotos solo se pueden enviar entre personas mayores de edad';
  end if;
  if public.can_dm(new.sender, new.recipient) then return new; end if;   -- conversación permitida
  -- si no, solo puede ser la solicitud de mensaje entre personas mayores de edad
  if new.sender = new.recipient or public.dm_blocked(new.sender, new.recipient) then raise exception 'No se puede enviar mensajes a esta persona'; end if;
  if not (public.is_adult(new.sender) and public.is_adult(new.recipient)) then
    raise exception 'Para escribirse, las personas menores de edad deben seguirse mutuamente';
  end if;
  if exists (select 1 from public.dm_requests where sender = new.sender and recipient = new.recipient)
     or exists (select 1 from public.dm_requests where sender = new.recipient and recipient = new.sender and status = 'pending')
     or exists (select 1 from public.messages where sender = new.sender and recipient = new.recipient) then
    raise exception 'Ya existe una solicitud de mensaje con esta persona';
  end if;
  if new.img <> '' or new.story_id is not null or btrim(new.text) = '' then raise exception 'La solicitud solo puede ser un mensaje escrito'; end if;
  if length(new.text) > 300 then raise exception 'La solicitud puede tener hasta 300 caracteres'; end if;
  if t ~ '(https?:|www\.|[a-z0-9-]+\.(com|net|org|me|gg|tv|ly|io|link|app|xyz)\y|@)' or t ~ '([0-9][^0-9]{0,3}){7,}' then
    raise exception 'La solicitud no puede incluir enlaces, correos ni números de teléfono';
  end if;
  insert into public.dm_requests (sender, recipient) values (new.sender, new.recipient);
  return new;
end $$;
drop trigger if exists trg_guard_message on public.messages;
create trigger trg_guard_message before insert on public.messages for each row execute function public.guard_message();

-- (volátil a propósito: así ve la solicitud que el trigger acaba de crear en esta misma operación)
create or replace function public.dm_request_pending(a uuid, b uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  return exists (select 1 from public.dm_requests where sender = a and recipient = b and status = 'pending');
end $$;

drop policy if exists m_ins on public.messages;
create policy m_ins on public.messages for insert to authenticated with check (
  sender = auth.uid() and not public.dm_blocked(sender, recipient)
  and (public.can_dm(sender, recipient) or public.dm_request_pending(sender, recipient)));

-- ---------- responder una solicitud: accept | reject | block ----------
create or replace function public.answer_dm_request(from_user uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if action not in ('accept','reject','block') then raise exception 'Acción no válida'; end if;
  if not exists (select 1 from public.dm_requests where sender = from_user and recipient = auth.uid() and status = 'pending') then
    raise exception 'Esta solicitud ya no está disponible';
  end if;
  update public.dm_requests set status = case when action = 'accept' then 'accepted' else 'rejected' end, answered_at = now()
   where sender = from_user and recipient = auth.uid();
  if action = 'block' then
    insert into public.blocks (blocker, blocked, kind) values (auth.uid(), from_user, 'block') on conflict do nothing;
  elsif action = 'accept' then
    insert into public.notifications (user_id, type, extra, xv)
    values (from_user, 'sys', '{n} aceptó tu solicitud de mensaje.', jsonb_build_object('n', (select name from public.profiles where id = auth.uid())));
  end if;                                                                -- rechazar o bloquear: no se avisa a la otra persona
end $$;
grant execute on function public.answer_dm_request(uuid, text) to authenticated;

-- ---------- avisos: quién puede crearlos ----------
create or replace function public.muted_by(target uuid, who uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker = target and blocked = who)
$$;

drop policy if exists n_ins on public.notifications;
create policy n_ins on public.notifications for insert to authenticated with check (
  public.is_staff()
  or (from_user = auth.uid() and type in ('follow','like','comment','reply','clike','chapter') and not public.muted_by(user_id, auth.uid())));

-- "me gusta" y "seguir" no repiten el aviso
create or replace function public.dedupe_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('like','follow') and exists (select 1 from public.notifications
      where user_id = new.user_id and type = new.type and from_user is not distinct from new.from_user and story_id is not distinct from new.story_id) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists trg_dedupe_notification on public.notifications;
create trigger trg_dedupe_notification before insert on public.notifications for each row execute function public.dedupe_notification();

-- ---------- ¿es mayor de edad? (solo un sí/no, sin fecha de nacimiento) ----------
-- La app lo necesita para saber si a otra persona se le escribe con solicitud (mayores) o por seguimiento mutuo (menores).
create or replace function public.adult_flags(ids uuid[]) returns table (id uuid, adult boolean)
language sql stable security definer set search_path = public as $$
  select p.id, public.is_adult(p.id) from public.profiles p where p.id = any (ids) and auth.uid() is not null
$$;
grant execute on function public.adult_flags(uuid[]) to authenticated;
grant execute on function public.dm_request_pending(uuid, uuid), public.dm_blocked(uuid, uuid), public.can_dm(uuid, uuid), public.muted_by(uuid, uuid) to authenticated;
