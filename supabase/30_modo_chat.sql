-- Auri · 30 · Modo del libro (tradicional o chat)
-- Los chats viajan dentro del texto de cada capítulo, así que esta es la única columna nueva.
alter table public.stories add column if not exists mode text not null default 'trad';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stories_mode_chk') then
    alter table public.stories add constraint stories_mode_chk check (mode in ('trad', 'chat'));
  end if;
end $$;
