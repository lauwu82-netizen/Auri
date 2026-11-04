-- 35 · Adornos de arriba ajustables: hasta 2 adornos, cada uno con posición, giro y tamaño.
-- Ejecutar en una consulta nueva del SQL Editor. Si no se ejecuta, todo sigue funcionando con el adorno de siempre (sin ajustes).
-- Formato de cada elemento: {"k":"bow:pink","x":91,"y":4,"r":0,"s":1}  (x, y en % de la foto; r en grados; s = tamaño, 1 es normal)

alter table public.profiles add column if not exists cos_adj jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_cos_adj_check') then
    alter table public.profiles add constraint profiles_cos_adj_check
      check (cos_adj is null or (jsonb_typeof(cos_adj) = 'array' and jsonb_array_length(cos_adj) <= 2));
  end if;
end $$;
