-- El constructor graba o sube sus propios videos de presentación.
--
-- Igual que el estimador (20261104b_perfil_video_estimador.sql): desde
-- /client/perfil gestiona los suyos (crear, cambiar el título, eliminar),
-- siempre ligados a su perfil y dentro de su carpeta `<perfil_id>/` del
-- bucket `presentaciones`.
--
-- · Tabla: INSERT / UPDATE / DELETE del dueño con rol constructor. Al crear,
--   la fila y sus rutas son suyas y las vistas empiezan en 0. El UPDATE ya
--   está limitado a `titulo` (20261104b).
-- · Storage: el constructor sube, reemplaza (la miniatura usa upsert) y borra
--   sólo en su carpeta.
-- · Lectura y vistas no cambian: ya ve los suyos y verse a uno mismo no cuenta.
--
-- Rollback: rollback/20261104d_perfil_video_constructor_rollback.sql
-- Requiere 20261104_perfil_video.sql, 20261104b y `public.mi_rol()`.

-- 1 — Tabla -------------------------------------------------------------------
drop policy if exists perfil_video_insert_constructor on public.perfil_video;
create policy perfil_video_insert_constructor on public.perfil_video
  for insert to authenticated
  with check (
    public.mi_rol() = 'constructor'
    and perfil_id  = (select auth.uid())
    and creado_por = (select auth.uid())
    and vistas = 0
    and split_part(video_path, '/', 1) = (select auth.uid())::text
    and (miniatura_path is null or split_part(miniatura_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists perfil_video_update_constructor on public.perfil_video;
create policy perfil_video_update_constructor on public.perfil_video
  for update to authenticated
  using      (public.mi_rol() = 'constructor' and perfil_id = (select auth.uid()))
  with check (public.mi_rol() = 'constructor' and perfil_id = (select auth.uid()));

drop policy if exists perfil_video_delete_constructor on public.perfil_video;
create policy perfil_video_delete_constructor on public.perfil_video
  for delete to authenticated
  using (public.mi_rol() = 'constructor' and perfil_id = (select auth.uid()));

-- 2 — Storage: bucket `presentaciones` ----------------------------------------
drop policy if exists "presentaciones_insert_constructor" on storage.objects;
create policy "presentaciones_insert_constructor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'constructor'
  );

drop policy if exists "presentaciones_update_constructor" on storage.objects;
create policy "presentaciones_update_constructor" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'constructor'
  )
  with check (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'constructor'
  );

drop policy if exists "presentaciones_delete_constructor" on storage.objects;
create policy "presentaciones_delete_constructor" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'constructor'
  );
