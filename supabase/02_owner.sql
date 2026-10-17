-- Ejecuta esto UNA VEZ, después de haber creado tu cuenta en Auri con tu correo.
-- Te convierte en Owner con acceso a las dos comunidades.
update public.profiles
set role = 'OWNER', scope = array['es','en'], frame_worn = true
where id = (select id from auth.users where lower(email) = lower('danielagarcia23082004@gmail.com'));
