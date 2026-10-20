-- =====================================================================
-- Auri Studios · Paso 4: moderación
--   Strikes, suspensiones, apelaciones, reportes, regalos (marco Top 50),
--   ascensos y registro de acciones. Los permisos los decide el servidor:
--   la app solo llama a estas funciones.
-- Se ejecuta UNA vez en el SQL Editor de Supabase (se puede repetir sin problema).
-- =====================================================================

alter table public.strikes add column if not exists void_at timestamptz;
alter table public.reports add column if not exists label text not null default '';

-- ---------- ayudas ----------
-- ¿La persona en sesión puede aplicar acciones de moderación sobre esta cuenta? (mismas reglas que la app)
create or replace function public.can_act(tg uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me text := public.my_role(); tr text; tc text; sc text[];
begin
  if auth.uid() is null or tg is null or tg = auth.uid() then return false; end if;
  select role, community into tr, tc from public.profiles where id = tg; if tr is null then return false; end if;
  if me <> 'OWNER' then
    select scope into sc from public.profiles where id = auth.uid();
    if not (tc = any (coalesce(sc, '{}'::text[]))) then return false; end if;
  end if;
  return case me when 'OWNER' then tr <> 'OWNER' when 'ADMIN' then tr in ('USER','MODERATOR') when 'MODERATOR' then tr = 'USER' else false end;
end $$;

-- avisa al equipo de una comunidad (la Owner siempre; Administración y Moderación si moderan esa comunidad)
create or replace function public.notify_staff(comm text, p_type text, p_extra text, p_xv jsonb, p_href text, p_only_admin boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, from_user, extra, xv, href)
  select p.id, p_type, null, p_extra, p_xv, p_href from public.profiles p
  where p.id is distinct from auth.uid()
    and (p.role = 'OWNER' or (p.role = 'ADMIN' and comm = any (coalesce(p.scope, '{}'::text[])))
         or (not p_only_admin and p.role = 'MODERATOR' and comm = any (coalesce(p.scope, '{}'::text[]))));
end $$;

create or replace function public.log_action(p_type text, p_target text, p_extra text) returns void
language sql security definer set search_path = public as
$$ insert into public.modlog (type, by, target, extra) values (p_type, auth.uid(), coalesce(p_target, ''), coalesce(p_extra, '')) $$;

-- ---------- strikes ----------
create or replace function public.give_strike(target uuid, reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not public.is_staff() or not public.can_act(target) then raise exception 'No tienes permiso para esta acción'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Escribe el motivo del strike'; end if;
  insert into public.strikes (user_id, reason, by) values (target, left(btrim(reason), 500), auth.uid()) returning id into sid;
  insert into public.notifications (user_id, type, extra) values (target, 'strike', sid::text);
  perform public.log_action('strike', target::text, left(btrim(reason), 120));
  return sid;
end $$;

create or replace function public.annul_strike(sid uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare s public.strikes;
begin
  select * into s from public.strikes where id = sid;
  if not found then raise exception 'Ese strike ya no existe'; end if;
  if not public.is_admin_plus() or not public.can_act(s.user_id) then raise exception 'Solo Administración y Owner pueden anular strikes'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Escribe el motivo de la anulación'; end if;
  update public.strikes set void = true, void_reason = left(btrim(reason), 300), void_by = auth.uid(), void_at = now() where id = sid;
  insert into public.notifications (user_id, type, extra, xv)
  values (s.user_id, 'sys', 'Un strike de tu cuenta fue anulado: {r}', jsonb_build_object('r', left(btrim(reason), 120)));
  perform public.log_action('strike-annul', s.user_id::text, left(btrim(reason), 100));
end $$;

-- ---------- suspensiones ----------
create or replace function public.ban_user(target uuid, days int, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_plus() or not public.can_act(target) then raise exception 'Solo Administración y Owner pueden suspender o bloquear cuentas'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Escribe el motivo de la suspensión'; end if;
  if days is not null and (days < 0 or days > 3650) then raise exception 'Duración no válida'; end if;
  insert into public.bans (user_id, reason, by, until, created_at)
  values (target, left(btrim(reason), 500), auth.uid(), case when coalesce(days, 0) > 0 then now() + make_interval(days => days) end, now())
  on conflict (user_id) do update set reason = excluded.reason, by = excluded.by, until = excluded.until, created_at = excluded.created_at;
  perform public.log_action('ban', target::text, (case when coalesce(days, 0) > 0 then days || ' día(s): ' else 'permanente: ' end) || left(btrim(reason), 100));
end $$;

create or replace function public.lift_ban(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_plus() or not public.can_act(target) then raise exception 'Solo Administración y Owner pueden levantar una suspensión'; end if;
  delete from public.bans where user_id = target;
  update public.appeals set status = 'released', handled_by = auth.uid(), handled_at = now(), note = 'Cuenta liberada' where user_id = target and status = 'open';
  perform public.log_action('unban', target::text, '');
end $$;

-- ---------- apelaciones ----------
create or replace function public.submit_appeal(txt text, imgs text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.bans; aid uuid; nm text;
begin
  select * into b from public.bans where user_id = auth.uid() and (until is null or until > now());
  if not found then raise exception 'La cuenta ya no está suspendida'; end if;
  if length(btrim(coalesce(txt, ''))) < 10 then raise exception 'Cuenta qué ocurrió con al menos 10 caracteres'; end if;
  if exists (select 1 from public.appeals where user_id = auth.uid() and ban_date = b.created_at) then raise exception 'Ya se envió una apelación para esta decisión'; end if;
  insert into public.appeals (user_id, ban_date, ban_reason, ban_by, ban_until, text, imgs)
  values (auth.uid(), b.created_at, b.reason, b."by", b.until, left(btrim(txt), 1000), coalesce(imgs[1:4], '{}')) returning id into aid;
  select name into nm from public.profiles where id = auth.uid();
  perform public.notify_staff((select community from public.profiles where id = auth.uid()), 'sys', 'Nueva apelación de {n}', jsonb_build_object('n', nm), '#/moderation/appeals', true);
  return aid;
end $$;

create or replace function public.resolve_appeal(aid uuid, action text, note text) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare a public.appeals;
begin
  select * into a from public.appeals where id = aid;
  if not found then raise exception 'Esta apelación ya no existe'; end if;
  if not public.is_admin_plus() or not public.can_act(a.user_id) then raise exception 'Solo Administración y Owner pueden resolver apelaciones'; end if;
  if a.status <> 'open' then raise exception 'Esta apelación ya fue resuelta'; end if;
  if action = 'release' then
    delete from public.bans where user_id = a.user_id;
    update public.appeals set status = 'released', handled_by = auth.uid(), handled_at = now(), note = 'Cuenta liberada' where user_id = a.user_id and status = 'open';
    insert into public.notifications (user_id, type, extra) values (a.user_id, 'sys', 'Tu apelación fue aceptada y tu cuenta fue liberada.');
    perform public.log_action('unban', a.user_id::text, '');
    perform public.log_action('appeal-release', a.user_id::text, aid::text);
  elsif action = 'reject' then
    if length(btrim(coalesce(note, ''))) < 3 then raise exception 'Escribe el motivo del rechazo'; end if;
    update public.appeals set status = 'rejected', handled_by = auth.uid(), handled_at = now(), note = left(btrim(note), 400) where id = aid;
    insert into public.notifications (user_id, type, extra, xv) values (a.user_id, 'sys', 'Tu apelación fue rechazada: {n}', jsonb_build_object('n', left(btrim(note), 400)));
    perform public.log_action('appeal-reject', a.user_id::text, left(btrim(note), 100));
  else raise exception 'Acción no válida'; end if;
end $$;

-- ---------- reportes ----------
-- al crear un reporte se avisa al equipo de la comunidad correspondiente
create or replace function public.report_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'reclass' then
    perform public.notify_staff(new.community, 'sys', 'Solicitud para quitar +18 de «{title}»', jsonb_build_object('title', coalesce(nullif(new.title, ''), 'una obra')), '#/moderation/reports');
  elsif new.type <> 'problem' then
    perform public.notify_staff(new.community, 'sys', 'Nuevo reporte por revisar: {l}', jsonb_build_object('l', new.label), '#/moderation/reports');
  end if;
  return new;
end $$;
drop trigger if exists trg_report_notify on public.reports;
create trigger trg_report_notify after insert on public.reports for each row execute function public.report_notify();

create or replace function public.resolve_report(rid uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  select * into r from public.reports where id = rid;
  if not found then raise exception 'Este reporte ya no existe'; end if;
  if not public.is_staff() or not public.in_scope(r.community) then raise exception 'No tienes permiso para esta acción'; end if;
  if st not in ('open','resolved','dismissed') then raise exception 'Estado no válido'; end if;
  update public.reports set status = st, handled_by = case when st = 'open' then null else auth.uid() end, handled_at = case when st = 'open' then null else now() end where id = rid;
  perform public.log_action('report-' || st, coalesce(r.owner, r.target)::text, rid::text);
end $$;

-- ---------- regalos (marco Top 50) ----------
create or replace function public.gift_send(to_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; left_n int;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede regalar'; end if;
  perform public.gifts_sweep();
  if to_id = auth.uid() or (select role from public.profiles where id = to_id) = 'OWNER' then raise exception 'Ese marco es para otras cuentas'; end if;
  if (select frame_top from public.profiles where id = to_id) then raise exception 'Esa persona ya tiene el marco'; end if;
  insert into public.gifts (to_user, by) values (to_id, auth.uid()) returning id into gid;       -- el trigger revisa cupos y duplicados
  select 53 - count(*) into left_n from public.gifts where status in ('pending','claimed');
  insert into public.notifications (user_id, type, extra, href) values (to_id, 'sys', '¡Te regalaron el marco exclusivo Top 50! Reclámalo en las próximas 24 h.', '#/gift');
  perform public.log_action('gift-send', to_id::text, 'Marco Top 50 · quedan ' || left_n || ' de 53');
  return gid;
end $$;

create or replace function public.gift_cancel(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.gifts;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede cancelar regalos'; end if;
  select * into g from public.gifts where id = gid for update;
  if not found or g.status not in ('pending','claimed') then raise exception 'Este regalo ya no está disponible'; end if;
  update public.gifts set status = 'revoked', ended_at = now() where id = gid;
  if g.status = 'claimed' then
    perform set_config('auri.bypass', '1', true);
    update public.profiles set frame_top = false where id = g.to_user;
    perform set_config('auri.bypass', '0', true);
  end if;
  insert into public.notifications (user_id, type, extra) values (g.to_user, 'sys', case when g.status = 'claimed' then 'Se retiró tu marco Top 50.' else 'Se canceló tu regalo del marco Top 50.' end);
  perform public.log_action('gift-revoke', g.to_user::text, (case when g.status = 'claimed' then 'Marco retirado' else 'Regalo cancelado' end) || ' · cupo devuelto');
end $$;

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
  insert into public.notifications (user_id, type, extra, xv, href)
  values (g."by", 'sys', '{n} reclamó su marco Top 50.', jsonb_build_object('n', (select name from public.profiles where id = auth.uid())), '#/moderation/gifts');
  insert into public.modlog (type, by, target, extra) values ('gift-claim', auth.uid(), auth.uid()::text, 'Reclamó el marco Top 50');
end $$;

-- los regalos sin reclamar a las 24 h se cancelan y el cupo vuelve a la Owner (cualquiera puede llamarla; es idempotente)
create or replace function public.gifts_sweep() returns void
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  for g in update public.gifts set status = 'expired', ended_at = now() where status = 'pending' and expires_at <= now() returning to_user, "by" loop
    insert into public.notifications (user_id, type, extra, xv, href) select g."by", 'sys', 'El regalo para {n} venció sin reclamarse: el cupo volvió a ti.', jsonb_build_object('n', (select name from public.profiles where id = g.to_user)), '#/moderation/gifts' where g."by" is not null;
    insert into public.notifications (user_id, type, extra) values (g.to_user, 'sys', 'Tu regalo (marco Top 50) se canceló porque pasaron 24 h sin reclamarlo.');
    insert into public.modlog (type, by, target, extra) values ('gift-expire', null, g.to_user::text, 'Marco Top 50 sin reclamar en 24 h · cupo devuelto');
  end loop;
end $$;

-- ---------- ascensos: el marco nuevo es obligatorio (se pone al aceptar, no antes) ----------
create or replace function public.answer_invite(nid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id = nid and user_id = auth.uid() and type = 'modinvite' and done is null;
  if not found then raise exception 'Esta invitación ya no está disponible'; end if;
  if accept then
    if not public.is_adult(auth.uid()) then raise exception 'Tu cuenta no puede aceptar esta invitación'; end if;
    if (n.role = 'MODERATOR' and public.my_role() <> 'USER') or (n.role = 'ADMIN' and public.my_role() <> 'MODERATOR') then raise exception 'Tu cuenta no puede aceptar esta invitación'; end if;
    perform set_config('auri.bypass', '1', true);
    update public.profiles set role = n.role, frame_worn = false,
      scope = case when scope = '{}' then array[community] else scope end,
      mod_since = case when n.role = 'MODERATOR' then current_date else mod_since end,
      adm_since = case when n.role = 'ADMIN' then current_date else adm_since end
    where id = auth.uid();
    perform set_config('auri.bypass', '0', true);
  end if;
  update public.notifications set done = case when accept then 'accepted' else 'declined' end, read = true where id = nid;
  insert into public.notifications (user_id, type, extra, xv)
  values (n.from_user, 'sys',
    case when n.role = 'ADMIN' then (case when accept then '{n} aceptó tu invitación y ya es parte de la administración.' else '{n} rechazó la invitación a la administración.' end)
         else (case when accept then '{n} aceptó tu invitación y ya es parte de la moderación.' else '{n} rechazó la invitación a la moderación.' end) end,
    jsonb_build_object('n', (select name from public.profiles where id = auth.uid())));
  insert into public.modlog (type, by, target) values (case when accept then 'accept-' else 'decline-' end || lower(n.role), auth.uid(), auth.uid()::text);
end $$;


-- ---------- ascensos y descensos (solo desde aquí) ----------
create or replace function public.invite_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not public.is_owner() then raise exception 'Solo la Owner puede hacer ascensos'; end if;
  if not public.can_act(target) then raise exception 'No tienes permiso para esta acción'; end if;
  select role into cur from public.profiles where id = target;
  if new_role = 'MODERATOR' and cur <> 'USER' then raise exception 'Esta persona ya es parte del equipo'; end if;
  if new_role = 'ADMIN' and cur <> 'MODERATOR' then raise exception 'Solo una persona moderadora puede ascender a administración'; end if;
  if new_role not in ('MODERATOR','ADMIN') then raise exception 'Rol no válido'; end if;
  if not public.is_adult(target) then raise exception 'Solo personas mayores de 18 años pueden ser parte del equipo'; end if;
  if exists (select 1 from public.notifications where user_id = target and type = 'modinvite' and done is null) then raise exception 'Ya tiene una invitación pendiente'; end if;
  insert into public.notifications (user_id, type, from_user, role) values (target, 'modinvite', auth.uid(), new_role);
  perform public.log_action('invite-' || lower(new_role), target::text, '');
end $$;

create or replace function public.revoke_role(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tr text;
begin
  if auth.uid() is null or target = auth.uid() then raise exception 'No tienes permiso para esta acción'; end if;
  select role into tr from public.profiles where id = target;
  if not (case when public.is_owner() then tr in ('MODERATOR','ADMIN') when public.my_role() = 'ADMIN' then tr = 'MODERATOR' else false end) then
    raise exception 'No tienes permiso para esta acción'; end if;
  perform set_config('auri.bypass', '1', true);
  if tr = 'ADMIN' then update public.profiles set role = 'MODERATOR', frame_worn = true, adm_since = null where id = target;
  else update public.profiles set role = 'USER', frame_worn = false, mod_since = null, adm_since = null where id = target; end if;
  perform set_config('auri.bypass', '0', true);
  insert into public.notifications (user_id, type, extra)
  values (target, 'sys', case when tr = 'ADMIN' then 'Tu rol de administración ha finalizado: sigues en el equipo de moderación.' else 'Tu participación en el equipo de moderación de Auri Studios ha finalizado.' end);
  perform public.log_action(case when tr = 'ADMIN' then 'demote-admin' else 'revoke' end, target::text, '');
end $$;

-- ---------- permisos ----------
revoke all on function public.can_act(uuid), public.notify_staff(text,text,text,jsonb,text,boolean), public.log_action(text,text,text) from public, anon, authenticated;
revoke all on function public.give_strike(uuid,text), public.annul_strike(uuid,text), public.ban_user(uuid,int,text), public.lift_ban(uuid),
  public.submit_appeal(text,text[]), public.resolve_appeal(uuid,text,text), public.resolve_report(uuid,text),
  public.gift_send(uuid), public.gift_cancel(uuid), public.gift_claim(uuid), public.gifts_sweep(), public.answer_invite(uuid,boolean),
  public.invite_role(uuid,text), public.revoke_role(uuid) from public, anon;
grant execute on function public.give_strike(uuid,text), public.annul_strike(uuid,text), public.ban_user(uuid,int,text), public.lift_ban(uuid),
  public.submit_appeal(text,text[]), public.resolve_appeal(uuid,text,text), public.resolve_report(uuid,text),
  public.gift_send(uuid), public.gift_cancel(uuid), public.gift_claim(uuid), public.gifts_sweep(), public.answer_invite(uuid,boolean),
  public.invite_role(uuid,text), public.revoke_role(uuid) to authenticated;
grant execute on function public.can_act(uuid) to authenticated;

-- las acciones de equipo que cambian a otras personas ya NO se hacen escribiendo directo en las tablas
drop policy if exists st_ins on public.strikes;
drop policy if exists st_upd on public.strikes;
drop policy if exists bn_w on public.bans;
drop policy if exists ap_ins on public.appeals;
drop policy if exists ap_upd on public.appeals;
drop policy if exists g_w on public.gifts;
drop policy if exists r_upd on public.reports;
