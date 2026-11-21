-- Prólogo y epílogo opcionales: una marca "kind" en cada capítulo. Repetible.
alter table public.chapters add column if not exists kind text not null default $q$$q$;
alter table public.chapter_published add column if not exists kind text not null default $q$$q$;

do $do$ begin
  if not exists (select 1 from pg_constraint where conname = $q$chapters_kind_ck$q$) then
    alter table public.chapters add constraint chapters_kind_ck check (kind in ($q$$q$, $q$prologue$q$, $q$epilogue$q$));
  end if;
end $do$;

create or replace function public.publish_chapter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' then
    insert into public.chapter_published (chapter_id, story_id, position, title, text, cover, music, kind)
    values (new.id, new.story_id, new.position, new.title, new.text, new.cover, new.music, new.kind)
    on conflict (chapter_id) do update set position = excluded.position, title = excluded.title, text = excluded.text,
      cover = excluded.cover, music = excluded.music, kind = excluded.kind, published_at = now();
  end if;
  return new;
end $$;
