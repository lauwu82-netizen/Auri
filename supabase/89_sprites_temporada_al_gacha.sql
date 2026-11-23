-- Auri · los sprites de temporada del pase de escritor entran al sorteo como legendarios 2 meses despues de que acabe la temporada (28 feb 2027 + 2 meses = 30 abr 2027)
alter table public.vn_emotions add column if not exists joins_gacha date;
update public.vn_emotions set joins_gacha = $q$2027-04-30$q$::date where key in ($q$corazon_roto$q$, $q$borracho_enamorado$q$);

create or replace function public._sprite_roll(p_items text[]) returns text
language plpgsql security definer set search_path = public as $$
declare x numeric := random() * 100; rar text; k text;
begin
  rar := case when x < 60 then $q$common$q$ when x < 85 then $q$uncommon$q$ when x < 97 then $q$epic$q$ else $q$legendary$q$ end;
  select key into k from public.vn_emotions
   where (rarity = rar or (rar = $q$legendary$q$ and rarity = $q$special$q$ and joins_gacha is not null and joins_gacha <= current_date))
     and not ($q$sprite:$q$ || key = any(p_items)) order by random() limit 1;
  if k is null then
    select key into k from public.vn_emotions
     where (rarity in ($q$common$q$,$q$uncommon$q$,$q$epic$q$,$q$legendary$q$) or (rarity = $q$special$q$ and joins_gacha is not null and joins_gacha <= current_date))
       and not ($q$sprite:$q$ || key = any(p_items)) order by random() limit 1;
  end if;
  return k;
end $$;
revoke all on function public._sprite_roll(text[]) from public, anon, authenticated;
