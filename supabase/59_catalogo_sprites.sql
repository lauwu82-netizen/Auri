-- Auri · catalogo de sprites con rarezas + sorteo del pase
alter table public.vn_emotions add column if not exists rarity text not null default $q$basic$q$;
insert into public.vn_emotions (key, name, free, sort, rarity) values
($q$pensativo$q$,$q$Pensativo$q$,false,10,$q$common$q$),
($q$celular$q$,$q$Revisando su celular$q$,false,11,$q$common$q$),
($q$motivado$q$,$q$Motivado$q$,false,12,$q$common$q$),
($q$confundido$q$,$q$Confundido$q$,false,13,$q$common$q$),
($q$nervioso$q$,$q$Nervioso$q$,false,14,$q$common$q$),
($q$bostezando$q$,$q$Bostezando$q$,false,15,$q$common$q$),
($q$dormido$q$,$q$Dormido$q$,false,16,$q$common$q$),
($q$cafe$q$,$q$Tomando café$q$,false,17,$q$common$q$),
($q$audifonos$q$,$q$Con audífonos$q$,false,18,$q$common$q$),
($q$sorprendido$q$,$q$Sorprendido$q$,false,19,$q$common$q$),
($q$coqueto$q$,$q$Coqueto$q$,false,20,$q$uncommon$q$),
($q$orgulloso$q$,$q$Orgulloso$q$,false,21,$q$uncommon$q$),
($q$carcajada$q$,$q$Riendo a carcajadas$q$,false,22,$q$uncommon$q$),
($q$celoso$q$,$q$Celoso$q$,false,23,$q$uncommon$q$),
($q$culpable$q$,$q$Culpable$q$,false,24,$q$uncommon$q$),
($q$mareado$q$,$q$Mareado$q$,false,25,$q$uncommon$q$),
($q$estirandose$q$,$q$Estirándose$q$,false,26,$q$uncommon$q$),
($q$panico$q$,$q$Pánico$q$,false,30,$q$epic$q$),
($q$yandere$q$,$q$Yandere$q$,false,31,$q$epic$q$),
($q$borracho$q$,$q$Borracho$q$,false,32,$q$epic$q$),
($q$borracho_triste$q$,$q$Borracho triste$q$,false,33,$q$epic$q$),
($q$emocionado$q$,$q$Muy emocionado$q$,false,34,$q$epic$q$),
($q$alma_fuera$q$,$q$Alma fuera del cuerpo$q$,false,35,$q$epic$q$),
($q$llorando_cascada$q$,$q$Llorando a cascadas$q$,false,40,$q$legendary$q$),
($q$estrellas$q$,$q$Resplandor de estrellas$q$,false,41,$q$legendary$q$),
($q$villano$q$,$q$Modo villano$q$,false,42,$q$legendary$q$),
($q$corazon_roto$q$,$q$Corazón roto$q$,false,50,$q$special$q$),
($q$borracho_enamorado$q$,$q$Borracho enamorado$q$,false,51,$q$special$q$)
on conflict (key) do update set name = excluded.name, free = excluded.free, sort = excluded.sort, rarity = excluded.rarity;

-- tipos de premio nuevos
alter table public.pass_rewards drop constraint if exists pass_rewards_kind_check;
alter table public.pass_rewards add constraint pass_rewards_kind_check check (kind in ($q$cyan$q$, $q$purple$q$, $q$coins$q$, $q$title$q$, $q$item$q$, $q$sprite_random$q$, $q$sprite_pick$q$));
delete from public.pass_rewards where kind in ($q$sprite_random$q$, $q$sprite_pick$q$) or key like $q$sprite:%$q$;
insert into public.pass_rewards (track, tier, level, kind, item, amount, key) values
($q$reader$q$,$q$free$q$,18,$q$sprite_random$q$,$q$sprite_random$q$,0,$q$sprite_random$q$),
($q$reader$q$,$q$paid$q$,15,$q$sprite_random$q$,$q$sprite_random$q$,0,$q$sprite_random$q$),
($q$reader$q$,$q$paid$q$,18,$q$sprite_random$q$,$q$sprite_random$q$,0,$q$sprite_random$q$),
($q$reader$q$,$q$paid$q$,20,$q$sprite_pick$q$,$q$sprite_pick$q$,0,$q$sprite_pick$q$),
($q$writer$q$,$q$free$q$,18,$q$item$q$,$q$sprite:corazon_roto$q$,0,$q$sprite:corazon_roto$q$),
($q$writer$q$,$q$paid$q$,18,$q$item$q$,$q$sprite:borracho_enamorado$q$,0,$q$sprite:borracho_enamorado$q$);

-- sorteo: 60% comun, 25% poco comun, 12% epico, 3% legendario; nunca repite uno que ya tienes
create or replace function public._sprite_roll(p_items text[]) returns text
language plpgsql security definer set search_path = public as $$
declare x numeric := random() * 100; rar text; k text;
begin
  rar := case when x < 60 then $q$common$q$ when x < 85 then $q$uncommon$q$ when x < 97 then $q$epic$q$ else $q$legendary$q$ end;
  select key into k from public.vn_emotions where rarity = rar and not ($q$sprite:$q$ || key = any(p_items)) order by random() limit 1;
  if k is null then
    select key into k from public.vn_emotions where rarity in ($q$common$q$,$q$uncommon$q$,$q$epic$q$,$q$legendary$q$) and not ($q$sprite:$q$ || key = any(p_items)) order by random() limit 1;
  end if;
  return k;
end $$;
revoke all on function public._sprite_roll(text[]) from public, anon, authenticated;

create or replace function public.pass_claim(p_track text, p_tier text, p_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.pass_seasons; today date := (now() at time zone $q$utc$q$)::date; st jsonb; r public.pass_rewards; ins int; n int := 0;
  its text[]; sk text; got jsonb := $q$[]$q$::jsonb;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  if p_track not in ($q$reader$q$, $q$writer$q$) or p_tier not in ($q$free$q$, $q$paid$q$) then raise exception $q$Premio no valido$q$; end if;
  select * into s from public.pass_seasons where today between starts and ends order by starts desc limit 1;
  if not found then raise exception $q$No hay una temporada activa$q$; end if;
  st := public.mission_state(p_track);
  if coalesce((st ->> $q$level$q$)::int, 1) < p_level then raise exception $q$Todavia no llegas a ese nivel$q$; end if;
  if p_tier = $q$paid$q$ and not coalesce((st ->> $q$owned$q$)::boolean, false) then raise exception $q$Necesitas el pase para reclamar esto$q$; end if;
  perform public._wallet_ensure(me);
  for r in select * from public.pass_rewards where track = p_track and tier = p_tier and level = p_level and kind <> $q$sprite_pick$q$ order by item loop
    insert into public.pass_claims (uid, season, track, tier, level, item) values (me, s.id, p_track, p_tier, p_level, r.item) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins = 0 then continue; end if;
    n := n + 1;
    if r.kind = $q$cyan$q$ then
      update public.wallets set cyan = cyan + r.amount, updated_at = now() where uid = me;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, $q$cyan$q$, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$purple$q$ then
      update public.wallets set purple = purple + r.amount, updated_at = now() where uid = me;
      insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, $q$purple$q$, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$coins$q$ then
      update public.wallets set coins = coins + r.amount, updated_at = now() where uid = me;
      insert into public.coin_ledger (uid, delta, reason, ref) values (me, r.amount, $q$pase$q$, $q$pass:$q$ || s.id || $q$:$q$ || p_track || $q$:$q$ || p_tier || $q$:$q$ || p_level);
    elsif r.kind = $q$item$q$ then
      perform set_config($q$auri.bypass$q$, $q$1$q$, true);
      update public.profiles set items = array_append(items, r.key) where id = me and not (r.key = any(items));
      perform set_config($q$auri.bypass$q$, $q$0$q$, true);
      if r.key like $q$sprite:%$q$ then got := got || to_jsonb(substr(r.key, 8)); end if;
    elsif r.kind = $q$title$q$ then
      perform set_config($q$auri.bypass$q$, $q$1$q$, true);
      update public.profiles set titles = array_append(titles, r.key) where id = me and not (r.key = any(titles));
      perform set_config($q$auri.bypass$q$, $q$0$q$, true);
    elsif r.kind = $q$sprite_random$q$ then
      select items into its from public.profiles where id = me;
      sk := public._sprite_roll(coalesce(its, array[]::text[]));
      if sk is null then
        -- ya tiene todos: se compensa con gemas moradas (10 gemas = 40 cuartos)
        update public.wallets set purple = purple + 40, updated_at = now() where uid = me;
        insert into public.gem_ledger (uid, kind, delta, reason, ref) values (me, $q$purple$q$, 40, $q$pase$q$, $q$pass:sprite-repetido$q$);
      else
        perform set_config($q$auri.bypass$q$, $q$1$q$, true);
        update public.profiles set items = array_append(items, $q$sprite:$q$ || sk) where id = me;
        perform set_config($q$auri.bypass$q$, $q$0$q$, true);
        got := got || to_jsonb(sk);
      end if;
    end if;
  end loop;
  if n = 0 then raise exception $q$Ya reclamaste este premio$q$; end if;
  return jsonb_build_object($q$ok$q$, true, $q$n$q$, n, $q$sprites$q$, got);
end $$;
revoke all on function public.pass_claim(text, text, int) from public, anon;
grant execute on function public.pass_claim(text, text, int) to authenticated;

-- sprite a eleccion (nivel 20 del pase de lector): comun, poco comun o epico que aun no tengas
create or replace function public.pass_pick_sprite(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.pass_seasons; today date := (now() at time zone $q$utc$q$)::date; st jsonb; its text[]; ins int;
begin
  if me is null then raise exception $q$Inicia sesion$q$; end if;
  select * into s from public.pass_seasons where today between starts and ends order by starts desc limit 1;
  if not found then raise exception $q$No hay una temporada activa$q$; end if;
  st := public.mission_state($q$reader$q$);
  if coalesce((st ->> $q$level$q$)::int, 1) < 20 then raise exception $q$Todavia no llegas a ese nivel$q$; end if;
  if not coalesce((st ->> $q$owned$q$)::boolean, false) then raise exception $q$Necesitas el pase para reclamar esto$q$; end if;
  if not exists (select 1 from public.vn_emotions where key = p_key and rarity in ($q$common$q$, $q$uncommon$q$, $q$epic$q$)) then raise exception $q$Ese sprite no se puede elegir$q$; end if;
  select items into its from public.profiles where id = me;
  if ($q$sprite:$q$ || p_key) = any(coalesce(its, array[]::text[])) then raise exception $q$Ya tienes ese sprite$q$; end if;
  insert into public.pass_claims (uid, season, track, tier, level, item) values (me, s.id, $q$reader$q$, $q$paid$q$, 20, $q$sprite_pick$q$) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then raise exception $q$Ya elegiste tu sprite$q$; end if;
  perform set_config($q$auri.bypass$q$, $q$1$q$, true);
  update public.profiles set items = array_append(items, $q$sprite:$q$ || p_key) where id = me;
  perform set_config($q$auri.bypass$q$, $q$0$q$, true);
  return jsonb_build_object($q$ok$q$, true, $q$key$q$, p_key);
end $$;
revoke all on function public.pass_pick_sprite(text) from public, anon;
grant execute on function public.pass_pick_sprite(text) to authenticated;

-- los sprites de pago solo se pueden usar si la cuenta los tiene
create or replace function public.vn_char_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v text; its text[]; ov text;
begin
  if tg_op = $q$INSERT$q$ and (select count(*) from public.vn_characters where story_id = new.story_id) >= 10 then raise exception $q$Maximo 10 personajes por libro$q$; end if;
  select items into its from public.profiles where id = auth.uid();
  for k, v in select key, value #>> $q${}$q$ from jsonb_each(new.sprites) loop
    if not exists (select 1 from public.vn_emotions where key = k) then raise exception $q$Emocion no valida: %$q$, k; end if;
    if v is null or length(v) > 600 or v !~ $q$^https://$q$ then raise exception $q$Sprite no valido$q$; end if;
    ov := case when tg_op = $q$UPDATE$q$ then old.sprites ->> k else null end;
    if ov is distinct from v and auth.uid() is not null and not public.is_owner()
       and exists (select 1 from public.vn_emotions where key = k and not free and rarity <> $q$basic$q$)
       and not ($q$sprite:$q$ || k = any(coalesce(its, array[]::text[]))) then
      raise exception $q$Todavia no tienes ese sprite$q$;
    end if;
  end loop;
  return new;
end $$;
