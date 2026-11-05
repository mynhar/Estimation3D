-- Rollback de 20261104c_expediente_video.sql
--
-- Borra los enlaces expediente ↔ video. Los videos siguen en la biblioteca de
-- cada estimador (perfil_video); sólo se pierde en qué expediente se usaron.

drop table if exists public.expediente_video;

alter table public.perfil_video drop constraint if exists perfil_video_id_perfil_key;

-- fn_expediente_de_fila sin 'expediente_video' (definición de 20261103d).
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
         'matterport_modelo', 'oferta', 'contrato', 'seguimiento_obra' then
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
