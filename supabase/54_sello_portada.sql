-- Auri · posición y tamaño del sello dorado de las portadas (Top 50)
alter table public.profiles add column if not exists seal_adj jsonb;
