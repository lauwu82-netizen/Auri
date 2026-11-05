-- Ajuste del adorno de abajo (posición arriba/abajo y tamaño). Guarda {"y": -40..40, "s": 0.5..1.8}
alter table public.profiles add column if not exists cos_bot jsonb;
alter table public.profiles drop constraint if exists profiles_cos_bot_check;
alter table public.profiles add constraint profiles_cos_bot_check check (cos_bot is null or jsonb_typeof(cos_bot) = 'object');
