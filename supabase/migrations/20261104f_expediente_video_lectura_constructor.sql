-- El constructor ve el video con el que el estimador se presenta en un expediente.
--
-- En /builder/my-offer/:id el constructor ve, sin poder tocarlo, el video que
-- el estimador enlazó al expediente (`expediente_video`), además del suyo.
-- Hasta ahora sólo leían el enlace, la fila de `perfil_video` y el archivo el
-- administrador y el dueño.
--
-- · `expediente_video`: el constructor lee los enlaces de los estimadores del
--   expediente (`expediente.estimador_id` o quien tenga una `estimacion` en
--   él), y sólo si puede ver ese expediente. La subconsulta a `expediente` se
--   evalúa con el RLS de quien llama, así que manda la misma regla que ya
--   decide qué expedientes ve el constructor (estado y exclusividad). Los
--   enlaces de otros constructores siguen ocultos: son la competencia.
-- · `perfil_video`: se lee una fila si se puede leer un enlace a ella.
-- · Bucket `presentaciones`: se lee un archivo (video o miniatura) si se puede
--   leer la fila de `perfil_video` que lo apunta.
--
-- Sólo lectura: insertar, cambiar y borrar siguen igual (el dueño y el
-- administrador). El contador de vistas tampoco cambia: sólo suma las del
-- administrador.
--
-- Rollback: rollback/20261104f_expediente_video_lectura_constructor_rollback.sql
-- Requiere 20261104e y `public.mi_rol()`.

-- 1 — Enlaces del expediente ------------------------------------------------
drop policy if exists expediente_video_select on public.expediente_video;
create policy expediente_video_select on public.expediente_video
  for select to authenticated
  using (
    public.mi_rol() = 'administrador'
    or perfil_id = (select auth.uid())
    or (
      public.mi_rol() = 'constructor'
      and exists (
        -- Con el RLS del constructor: sólo devuelve el expediente si lo ve.
        select 1
          from public.expediente e
         where e.id = expediente_video.expediente_id
           and (
             e.estimador_id = expediente_video.perfil_id
             or exists (
               select 1 from public.estimacion es
                where es.expediente_id = e.id
                  and es.estimador_id = expediente_video.perfil_id
             )
           )
      )
    )
  );

-- 2 — Biblioteca ------------------------------------------------------------
-- La subconsulta a `expediente_video` también va con el RLS de quien llama.
drop policy if exists perfil_video_select on public.perfil_video;
create policy perfil_video_select on public.perfil_video
  for select to authenticated
  using (
    public.mi_rol() = 'administrador'
    or perfil_id = (select auth.uid())
    or exists (
      select 1 from public.expediente_video ev
       where ev.perfil_video_id = perfil_video.id
    )
  );

-- 3 — Archivos --------------------------------------------------------------
-- La miniatura se busca por ruta igual que el video: necesita su índice.
create index if not exists perfil_video_miniatura_idx
  on public.perfil_video (miniatura_path);

drop policy if exists "presentaciones_select" on storage.objects;
create policy "presentaciones_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'presentaciones'
    and (
      public.mi_rol() = 'administrador'
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.perfil_video pv
         where pv.video_path = objects.name
            or pv.miniatura_path = objects.name
      )
    )
  );
