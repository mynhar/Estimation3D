-- Rollback de `20261018_reporte_por_servicio.sql`.
--
-- Atención: vuelve a «un parte por obra y día». Si ya hay días con partes de
-- varios servicios, el UNIQUE (seguimiento_id, fecha) no se podrá crear hasta
-- fusionarlos o borrar los sobrantes.

alter table public.reporte_diario
  drop constraint if exists reporte_diario_seguimiento_fecha_servicio_key;

alter table public.reporte_diario
  add constraint reporte_diario_seguimiento_id_fecha_key unique (seguimiento_id, fecha);

alter table public.reporte_diario
  alter column servicio_id drop not null;

create or replace function public.recalcular_avance_seguimiento(p_seguimiento_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_acum numeric(5,2) := 0;
  v_row  record;
begin
  for v_row in
    select id, porcentaje_avance_dia
      from reporte_diario
     where seguimiento_id = p_seguimiento_id
     order by fecha asc
  loop
    v_acum := least(v_acum + v_row.porcentaje_avance_dia, 100);
    update reporte_diario
       set porcentaje_acumulado = v_acum
     where id = v_row.id;
  end loop;

  update seguimiento_obra
     set porcentaje_avance = v_acum,
         estado            = case
                               when v_acum >= 100 then 'completado'::estado_seguimiento
                               else estado
                             end,
         fecha_fin_real    = case
                               when v_acum >= 100 and fecha_fin_real is null then now()
                               else fecha_fin_real
                             end,
         actualizado_en    = now()
   where id = p_seguimiento_id;
end;
$function$;

notify pgrst, 'reload schema';
