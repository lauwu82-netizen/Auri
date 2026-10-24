-- Adornos de perfil: cosmético de arriba (corona de Owner o moñito). La app solo lo muestra si la cuenta es Owner.
alter table public.profiles add column if not exists cos_top text;
