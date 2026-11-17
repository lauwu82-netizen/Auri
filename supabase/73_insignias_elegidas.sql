-- Insignias que cada persona elige mostrar en su perfil (vacio = automatico)
alter table public.profiles add column if not exists badges_shown text[];
