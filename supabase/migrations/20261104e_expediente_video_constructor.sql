-- El constructor también se presenta en un expediente con un video.
--
-- Desde /builder/make-offer/:id el constructor puede, si quiere, enlazar al
-- expediente un video de presentación: lo graba, lo sube o elige uno de su
-- biblioteca (`perfil_video`). Es la misma tabla que usa el estimador
-- (20261104c_expediente_video.sql), así que la columna deja de llamarse
-- `estimador_id` y pasa a `perfil_id`: quien se presenta, sea estimador o
-- constructor. Los enlaces que ya hay se conservan.
--
-- · Uno por persona y expediente (unique (expediente_id, perfil_id)).
-- · El video tiene que ser de quien se presenta (clave compuesta, sin cambios).
-- · Lectura: el administrador y el dueño (sin cambios).
-- · Escritura del constructor: sólo en expedientes donde puede ofertar, es
--   decir, que puede ver y que están en `estimado` o `en_oferta`. Retirarlo,
--   siempre. El estimador sigue igual.
--
-- Rollback: rollback/20261104e_expediente_video_constructor_rollback.sql
-- Requiere 20261104c, `public.mi_rol()`, `public.fn_estimador_de_expediente()`
-- y `public.constructor_puede_ver_expediente()`.

-- 1 — Columna y restricción ---------------------------------------------------
-- La clave compuesta, el unique y el índice siguen a la columna renombrada.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'expediente_video'
                and column_name = 'estimador_id') then
    alter table public.expediente_video rename column estimador_id to perfil_id;
  end if;
  if exists (select 1 from pg_constraint where conname = 'expediente_video_estimador_id_fkey') then
    alter table public.expediente_video
      rename constraint expediente_video_estimador_id_fkey to expediente_video_perfil_id_fkey;
  end if;
end;
$$;

comment on table public.expediente_video is
  'Video de presentación (perfil_video) con el que un estimador o un constructor se presenta en un expediente.';

-- 2 — RLS ---------------------------------------------------------------------
drop policy if exists expediente_video_select on public.expediente_video;
create policy expediente_video_select on public.expediente_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or perfil_id = (select auth.uid()));

drop policy if exists expediente_video_insert on public.expediente_video;
create policy expediente_video_insert on public.expediente_video
  for insert to authenticated
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and perfil_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
    or (
      public.mi_rol() = 'constructor'
      and perfil_id = (select auth.uid())
      and public.constructor_puede_ver_expediente(expediente_id)
      and exists (
        select 1 from public.expediente e
         where e.id = expediente_id
           and e.estado in ('estimado', 'en_oferta')
      )
    )
  );

drop policy if exists expediente_video_update on public.expediente_video;
create policy expediente_video_update on public.expediente_video
  for update to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() in ('estimador', 'constructor') and perfil_id = (select auth.uid()))
  )
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and perfil_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
    or (
      public.mi_rol() = 'constructor'
      and perfil_id = (select auth.uid())
      and public.constructor_puede_ver_expediente(expediente_id)
      and exists (
        select 1 from public.expediente e
         where e.id = expediente_id
           and e.estado in ('estimado', 'en_oferta')
      )
    )
  );

drop policy if exists expediente_video_delete on public.expediente_video;
create policy expediente_video_delete on public.expediente_video
  for delete to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() in ('estimador', 'constructor') and perfil_id = (select auth.uid()))
  );
