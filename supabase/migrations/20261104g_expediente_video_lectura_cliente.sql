-- El cliente ve los videos de presentación en su expediente.
--
-- En /client/builder-offer/:id el cliente ve, sin poder tocarlos, el video
-- con el que se presenta el estimador y el de cada constructor que le hizo
-- una oferta (`expediente_video`).
--
-- · Sólo en sus expedientes (`expediente.cliente_id`).
-- · Del estimador del expediente (`expediente.estimador_id` o quien tenga una
--   `estimacion` en él).
-- · De un constructor, sólo si tiene una oferta viva en el expediente (no
--   eliminada): quien enlazó un video pero no ofertó, o retiró la oferta, no
--   aparece.
-- · `perfil_video` y el bucket `presentaciones` no cambian: desde 20261104f se
--   leen si se puede leer un enlace a ellos.
--
-- Sólo lectura: insertar, cambiar y borrar siguen igual. Las reglas del
-- constructor y del estimador (20261104f) se conservan tal cual.
--
-- Rollback: rollback/20261104g_expediente_video_lectura_cliente_rollback.sql
-- Requiere 20261104f y `public.mi_rol()`.

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
    or (
      public.mi_rol() = 'cliente'
      and exists (
        select 1
          from public.expediente e
         where e.id = expediente_video.expediente_id
           and e.cliente_id = (select auth.uid())
           and (
             e.estimador_id = expediente_video.perfil_id
             or exists (
               select 1 from public.estimacion es
                where es.expediente_id = e.id
                  and es.estimador_id = expediente_video.perfil_id
             )
             or exists (
               select 1 from public.oferta o
                where o.expediente_id = e.id
                  and o.constructor_id = expediente_video.perfil_id
                  and o.eliminada_en is null
             )
           )
      )
    )
  );
