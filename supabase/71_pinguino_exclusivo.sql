-- Mascota exclusiva: pinguino azul con monito rosa, solo para la cuenta Rojasxtra
update public.profiles
set items = array_append(items, $q$pet:pinguino$q$)
where lower(username) = lower($q$Rojasxtra$q$) and not ($q$pet:pinguino$q$ = any(items));
