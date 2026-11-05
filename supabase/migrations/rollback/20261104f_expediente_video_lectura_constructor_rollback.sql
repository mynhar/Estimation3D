-- Rollback de 20261104f_expediente_video_lectura_constructor.sql
--
-- Vuelve a la lectura de antes: sólo el administrador y el dueño leen los
-- enlaces, las filas de `perfil_video` y los archivos del bucket. No borra
-- datos.

drop policy if exists expediente_video_select on public.expediente_video;
create policy expediente_video_select on public.expediente_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or perfil_id = (select auth.uid()));

drop policy if exists perfil_video_select on public.perfil_video;
create policy perfil_video_select on public.perfil_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or perfil_id = auth.uid());

drop policy if exists "presentaciones_select" on storage.objects;
create policy "presentaciones_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'presentaciones'
    and (
      public.mi_rol() = 'administrador'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop index if exists public.perfil_video_miniatura_idx;
