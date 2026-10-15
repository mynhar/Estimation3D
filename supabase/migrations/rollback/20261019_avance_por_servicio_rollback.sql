-- Rollback de `20261019_avance_por_servicio.sql`.
--
-- Vuelve al avance único por obra: el tope del 100 % es para la obra entera y
-- el acumulado de cada parte suma todos los servicios. Recalcula las obras.

create or replace function public.fn_reporte_clamp_avance()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_gastado numeric(5,2);
begin
  select coalesce(sum(porcentaje_avance_dia), 0)
    into v_gastado
    from reporte_diario
   where seguimiento_id = new.seguimiento_id
     and id <> new.id;

  new.porcentaje_avance_dia := least(
    greatest(new.porcentaje_avance_dia, 0),
    greatest(100 - v_gastado, 0)
  );

  return new;
end;
$function$;

drop trigger if exists trg_reporte_tope on public.reporte_diario;

create trigger trg_reporte_clamp
  before insert or update of porcentaje_avance_dia on public.reporte_diario
  for each row
  execute function public.fn_reporte_clamp_avance();

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
     order by fecha asc, creado_en asc, id asc
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

drop trigger if exists trg_reporte_seguimiento on public.reporte_diario;

create trigger trg_reporte_seguimiento
  after insert or update of porcentaje_avance_dia, fase_id, hora_inicio, fecha
  on public.reporte_diario
  for each row
  execute function public.fn_reporte_actualiza_seguimiento();

select public.recalcular_avance_seguimiento(id) from public.seguimiento_obra;

notify pgrst, 'reload schema';
