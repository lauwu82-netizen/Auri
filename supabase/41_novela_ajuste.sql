-- =====================================================================
-- AURI · Novela visual · ajuste de posición de cada personaje
-- Ejecutar DESPUÉS de 40_novela_visual.sql, en una consulta nueva del SQL Editor.
-- La autoría deja guardada la posición recomendada de cada personaje: x (izquierda/derecha), y (cuánto baja, para mostrar de torso hacia arriba) y s (tamaño).
-- Cada lectora puede ajustarlo a su gusto en su dispositivo; eso no necesita servidor.
-- =====================================================================
alter table public.vn_characters add column if not exists adj jsonb not null default '{}' check (jsonb_typeof(adj) = 'object');

create or replace function public.vn_adj_guard() returns trigger language plpgsql as $$
declare k text; v numeric;
begin
  for k in select jsonb_object_keys(new.adj) loop
    if k not in ('x','y','s') then raise exception 'Ajuste no válido'; end if;
    if jsonb_typeof(new.adj -> k) <> 'number' then raise exception 'Ajuste no válido'; end if;
    v := (new.adj ->> k)::numeric;
    if (k = 'x' and v not between -40 and 40) or (k = 'y' and v not between -10 and 70) or (k = 's' and v not between 0.5 and 2) then raise exception 'Ajuste fuera de rango'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_vn_adj_guard on public.vn_characters;
create trigger trg_vn_adj_guard before insert or update on public.vn_characters for each row execute function public.vn_adj_guard();
