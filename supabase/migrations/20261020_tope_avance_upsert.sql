-- Tope del avance por servicio: no contar el propio parte al volver a guardarlo.
--
-- Requiere `20261019_avance_por_servicio.sql`.
--
-- La app guarda los partes con un upsert (INSERT … ON CONFLICT (seguimiento_id,
-- fecha, servicio_id) DO UPDATE). En PostgreSQL el BEFORE INSERT se ejecuta
-- primero sobre la fila PROPUESTA, que trae un id nuevo; el tope excluía solo
-- `id <> new.id`, así que contaba el parte que ya existía como «gastado». Y el
-- DO UPDATE toma el valor de EXCLUDED, que es la fila ya recortada.
--
-- Efecto: un parte de un servicio guardado al 5 % no podía subirse al 100 %
-- (quedaba en 95 %). Ahora se excluye también el parte de la misma fecha y
-- servicio, que es el mismo parte (la clave única es fecha + servicio).

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
     and id <> new.id
     and fecha is distinct from new.fecha;

  new.porcentaje_avance_dia := least(
    greatest(new.porcentaje_avance_dia, 0),
    greatest(100 - v_gastado, 0)
  );

  return new;
end;
$function$;

notify pgrst, 'reload schema';
