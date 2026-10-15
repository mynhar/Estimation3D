-- Rollback de `20261020_tope_avance_upsert.sql`.
--
-- Vuelve al tope que cuenta el propio parte en un upsert (no deja subirlo al 100 %).

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
     and servicio_id    = new.servicio_id
     and id <> new.id;

  new.porcentaje_avance_dia := least(
    greatest(new.porcentaje_avance_dia, 0),
    greatest(100 - v_gastado, 0)
  );

  return new;
end;
$function$;

notify pgrst, 'reload schema';
