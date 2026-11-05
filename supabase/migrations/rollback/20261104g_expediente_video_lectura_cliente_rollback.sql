-- Rollback de 20261104g_expediente_video_lectura_cliente.sql
--
-- Vuelve a la lectura de 20261104f: el cliente deja de ver los videos de su
-- expediente; el constructor sigue viendo los del estimador. No borra datos.

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
