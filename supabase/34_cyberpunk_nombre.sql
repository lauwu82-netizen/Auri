-- =====================================================================
-- AURI · El paquete «Futurista» pasa a llamarse «Cyberpunk» (solo cambia el nombre que sale en avisos y registros)
-- Ejecutar DESPUÉS de 33_estilos_chat.sql, en una consulta nueva del SQL Editor. Es opcional pero conviene correrlo.
-- =====================================================================
create or replace function public.skin_name(p text) returns text language sql immutable as
$$ select case p when 'kawaii' then 'Kawaii' when 'retro' then 'Retro 2000' when 'victoriano' then 'Victoriano' when 'antiguo' then 'Antiguo'
                 when 'futurista' then 'Cyberpunk' when 'sanvalentin' then 'San Valentín' when 'misterio' then 'Misterio nocturno' end $$;
