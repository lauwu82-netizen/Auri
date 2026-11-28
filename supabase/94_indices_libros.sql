-- Indices para que la lista de libros siga rapida cuando haya muchos
create index if not exists stories_updated_idx on public.stories (updated_at desc);
create index if not exists stories_owner_idx on public.stories (owner);
create index if not exists chapter_published_story_idx on public.chapter_published (story_id, position);
create index if not exists chapters_story_idx on public.chapters (story_id, position);
