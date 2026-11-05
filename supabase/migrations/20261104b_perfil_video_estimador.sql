-- El estimador graba o sube sus propios videos de presentación.
--
-- Hasta ahora sólo el administrador escribía en `perfil_video` y en el bucket
-- `presentaciones` (20261104_perfil_video.sql). Desde /client/perfil el
-- estimador gestiona los suyos: crear, cambiar el título y eliminar. Siempre
-- ligados a su perfil y dentro de su carpeta `<perfil_id>/` del bucket.
--
-- · Tabla: INSERT / UPDATE / DELETE del dueño con rol estimador. Al crear,
--   la fila y sus rutas son suyas y las vistas empiezan en 0.
-- · UPDATE limitado a la columna `titulo` para todos (el administrador
--   tampoco cambia otra cosa): el dueño no puede tocar vistas, rutas ni
--   tamaño. El trigger y la RPC (security definer) no se ven afectados.
-- · Storage: el estimador sube, reemplaza (la miniatura usa upsert) y borra
--   sólo en su carpeta.
-- · Vistas: verse a uno mismo no cuenta. Hoy sólo el administrador ve videos
--   ajenos, así que sólo él suma.
--
-- Rollback: rollback/20261104b_perfil_video_estimador_rollback.sql
-- Requiere 20261104_perfil_video.sql y `public.mi_rol()`.

-- 1 — Tabla -------------------------------------------------------------------
drop policy if exists perfil_video_insert_estimador on public.perfil_video;
create policy perfil_video_insert_estimador on public.perfil_video
  for insert to authenticated
  with check (
    public.mi_rol() = 'estimador'
    and perfil_id  = (select auth.uid())
    and creado_por = (select auth.uid())
    and vistas = 0
    and split_part(video_path, '/', 1) = (select auth.uid())::text
    and (miniatura_path is null or split_part(miniatura_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists perfil_video_update_estimador on public.perfil_video;
create policy perfil_video_update_estimador on public.perfil_video
  for update to authenticated
  using      (public.mi_rol() = 'estimador' and perfil_id = (select auth.uid()))
  with check (public.mi_rol() = 'estimador' and perfil_id = (select auth.uid()));

drop policy if exists perfil_video_delete_estimador on public.perfil_video;
create policy perfil_video_delete_estimador on public.perfil_video
  for delete to authenticated
  using (public.mi_rol() = 'estimador' and perfil_id = (select auth.uid()));

-- Sólo el título se edita desde la aplicación.
revoke update on public.perfil_video from authenticated;
grant  update (titulo) on public.perfil_video to authenticated;

-- 2 — Vistas ------------------------------------------------------------------
create or replace function public.registrar_vista_perfil_video(p_video_id uuid)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.perfil_video
     set vistas = vistas + 1
   where id = p_video_id
     and perfil_id is distinct from auth.uid()   -- verse a uno mismo no cuenta
     and public.mi_rol() = 'administrador'       -- hoy sólo él ve videos ajenos
  returning vistas;
$function$;

-- 3 — Storage: bucket `presentaciones` ----------------------------------------
drop policy if exists "presentaciones_insert_estimador" on storage.objects;
create policy "presentaciones_insert_estimador" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'estimador'
  );

drop policy if exists "presentaciones_update_estimador" on storage.objects;
create policy "presentaciones_update_estimador" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'estimador'
  )
  with check (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'estimador'
  );

drop policy if exists "presentaciones_delete_estimador" on storage.objects;
create policy "presentaciones_delete_estimador" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'presentaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.mi_rol() = 'estimador'
  );
