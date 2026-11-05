-- Video de presentación del estimador en un expediente.
--
-- Desde /estimator/file-under-estimation/:id el estimador puede, si quiere,
-- presentarse en el expediente con un video corto: lo graba, lo sube o elige
-- uno de los que ya tiene (`perfil_video`). Lo que graba o sube se guarda en
-- su biblioteca y desde aquí sólo se enlaza.
--
-- · Tabla `expediente_video`: el enlace expediente ↔ estimador ↔ video. Uno por
--   estimador y expediente; cambiar de video reescribe el enlace.
-- · El video tiene que ser del propio estimador: clave foránea compuesta
--   (perfil_video_id, estimador_id) → perfil_video (id, perfil_id).
-- · Borrar el video de la biblioteca lo quita del expediente (cascade).
-- · Lectura: el administrador y el estimador dueño. Escritura: el estimador
--   del expediente (asignado o autor de la estimación) y el administrador.
-- · Expediente archivado: sólo el administrador enlaza o cambia el video (misma
--   guardia que el resto de tablas del expediente, 20261103d). Retirarlo sí
--   se permite: es la imagen del estimador.
--
-- Rollback: rollback/20261104c_expediente_video_rollback.sql
-- Requiere 20261104_perfil_video.sql, `public.mi_rol()`,
-- `public.fn_estimador_de_expediente()` y `public.set_actualizado_en()`.

-- 1 — Destino de la clave compuesta ------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfil_video_id_perfil_key') then
    alter table public.perfil_video
      add constraint perfil_video_id_perfil_key unique (id, perfil_id);
  end if;
end;
$$;

-- 2 — Tabla -------------------------------------------------------------------
create table if not exists public.expediente_video (
  id              uuid        primary key default gen_random_uuid(),
  expediente_id   uuid        not null references public.expediente(id) on delete cascade,
  estimador_id    uuid        not null references public.perfil(id) on delete cascade,
  perfil_video_id uuid        not null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint expediente_video_unico unique (expediente_id, estimador_id),
  constraint expediente_video_video_fkey foreign key (perfil_video_id, estimador_id)
    references public.perfil_video (id, perfil_id) on delete cascade
);

comment on table public.expediente_video is
  'Video de presentación (perfil_video) con el que un estimador se presenta en un expediente.';

-- Para el cascade al borrar un video de la biblioteca.
create index if not exists expediente_video_video_idx
  on public.expediente_video (perfil_video_id, estimador_id);

drop trigger if exists trg_expediente_video_actualizado on public.expediente_video;
create trigger trg_expediente_video_actualizado
  before update on public.expediente_video
  for each row execute function public.set_actualizado_en();

-- 3 — RLS ---------------------------------------------------------------------
alter table public.expediente_video enable row level security;

drop policy if exists expediente_video_select on public.expediente_video;
create policy expediente_video_select on public.expediente_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or estimador_id = (select auth.uid()));

drop policy if exists expediente_video_insert on public.expediente_video;
create policy expediente_video_insert on public.expediente_video
  for insert to authenticated
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and estimador_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
  );

drop policy if exists expediente_video_update on public.expediente_video;
create policy expediente_video_update on public.expediente_video
  for update to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() = 'estimador' and estimador_id = (select auth.uid()))
  )
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and estimador_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
  );

drop policy if exists expediente_video_delete on public.expediente_video;
create policy expediente_video_delete on public.expediente_video
  for delete to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() = 'estimador' and estimador_id = (select auth.uid()))
  );

revoke all on public.expediente_video from anon;
grant select, insert, update, delete on public.expediente_video to authenticated;

-- 4 — Expediente archivado: sólo el administrador ------------------------------
-- La guardia necesita saber de qué expediente es la fila.
create or replace function public.fn_expediente_de_fila(p_tabla text, p_fila jsonb)
returns uuid
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if p_fila is null then
    return null;
  end if;

  case p_tabla
    when 'expediente' then
      return (p_fila->>'id')::uuid;

    when 'localizacion', 'estimacion', 'expediente_servicio', 'expediente_invitacion',
         'matterport_modelo', 'oferta', 'contrato', 'seguimiento_obra',
         'expediente_video' then
      return (p_fila->>'expediente_id')::uuid;

    when 'reporte_diario', 'inspeccion' then
      select s.expediente_id into v_id
        from public.seguimiento_obra s
       where s.id = (p_fila->>'seguimiento_id')::uuid;
      return v_id;

    when 'reporte_actividad', 'reporte_zona' then
      select s.expediente_id into v_id
        from public.reporte_diario r
        join public.seguimiento_obra s on s.id = r.seguimiento_id
       where r.id = (p_fila->>'reporte_id')::uuid;
      return v_id;

    when 'archivo' then
      v_id := (p_fila->>'expediente_id')::uuid;
      if v_id is null and p_fila->>'estimacion_id' is not null then
        select e.expediente_id into v_id
          from public.estimacion e
         where e.id = (p_fila->>'estimacion_id')::uuid;
      end if;
      if v_id is null and p_fila->>'oferta_id' is not null then
        select o.expediente_id into v_id
          from public.oferta o
         where o.id = (p_fila->>'oferta_id')::uuid;
      end if;
      if v_id is null and p_fila->>'reporte_id' is not null then
        select s.expediente_id into v_id
          from public.reporte_diario r
          join public.seguimiento_obra s on s.id = r.seguimiento_id
         where r.id = (p_fila->>'reporte_id')::uuid;
      end if;
      return v_id;

    else
      return null;
  end case;
end;
$function$;

-- Sin DELETE: el video es la imagen del estimador y puede retirarlo siempre
-- (quitarlo del expediente o borrarlo de su biblioteca, que lo quita en cascada).
drop trigger if exists trg_archivado_solo_admin on public.expediente_video;
create trigger trg_archivado_solo_admin
  before insert or update on public.expediente_video
  for each row execute function public.fn_guardia_archivado_solo_admin();
