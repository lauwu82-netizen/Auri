-- La biografía admite hasta 500 caracteres (antes 300)
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 500);
