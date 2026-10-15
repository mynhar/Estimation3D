-- Un parte diario por obra, día y SERVICIO.
--
-- Requiere `20261017_reporte_servicio.sql`.
--
-- Hasta ahora había un parte por obra y día (`UNIQUE (seguimiento_id, fecha)`),
-- así que si en un mismo día se trabajaban dos servicios del contrato solo
-- podía registrarse uno. Ahora cada servicio trabajado ese día tiene su propio
-- parte, con su fase, actividades, zonas, descripción y archivos (todo cuelga
-- de `reporte_diario.id`).
--
-- El avance de la obra sigue siendo uno: cada parte suma su
-- `porcentaje_avance_dia` y el tope del 100 % ya se calcula excluyendo solo el
-- propio parte (`fn_reporte_clamp_avance`), así que vale con varios por día.

-- 1 — El servicio pasa a ser obligatorio (forma parte de la clave). Un INSERT
--     sin él lo sigue recibiendo de `fn_reporte_servicio`, que corre antes de
--     comprobar el NOT NULL.
alter table public.reporte_diario
  alter column servicio_id set not null;

-- 2 — Unicidad por servicio.
alter table public.reporte_diario
  drop constraint if exists reporte_diario_seguimiento_id_fecha_key;

alter table public.reporte_diario
  drop constraint if exists reporte_diario_seguimiento_fecha_servicio_key;

alter table public.reporte_diario
  add constraint reporte_diario_seguimiento_fecha_servicio_key
  unique (seguimiento_id, fecha, servicio_id);

-- 3 — Acumulado estable. Con dos partes el mismo día, ordenar solo por fecha
--     dejaba su orden al azar y el `porcentaje_acumulado` de cada uno podía
--     cambiar de un recálculo a otro. Resto idéntico a la versión vigente.
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

notify pgrst, 'reload schema';
