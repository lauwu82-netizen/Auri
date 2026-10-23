-- Avisos de capítulos nuevos: la autora (y el equipo que aprueba) puede ver quién guardó cada libro
drop policy if exists sub_owner_sel on public.subscriptions;
create policy sub_owner_sel on public.subscriptions for select to authenticated
  using (public.story_owner(story_id) = auth.uid() or public.is_staff());
