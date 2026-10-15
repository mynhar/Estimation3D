-- Avance por servicio y avance global del contrato.
--
-- Requiere `20261018_reporte_por_servicio.sql`.
--
-- Cada servicio del contrato avanza por su cuenta, de 0 a 100 %:
--   · el `porcentaje_avance_dia` de un parte suma al avance de SU servicio;
--   · un servicio no puede pasar del 100 % (tope por servicio, no por obra);
--   · el `porcentaje_acumulado` de cada parte es el de su servicio tras ese día.
-- El avance global de la obra (`seguimiento_obra.porcentaje_avance`) es la
-- media del avance de los servicios del contrato, todos con el mismo peso: llega
-- al 100 % cuando todos los servicios llegan al 100 %, y nunca lo supera.
-- El estado del seguimiento (`completado` / `en_progreso`) se deriva de ese
-- avance; el estado del CONTRATO no se toca.
-- Con un solo servicio, ambos avances coinciden y nada cambia.

-- 1 — Tope por servicio.
--     El nombre del trigger importa: los BEFORE se ejecutan por orden alfabético
--     y este tiene que correr después de `trg_reporte_servicio`, que es quien
--     rellena el servicio cuando no llega.
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

drop trigger if exists trg_reporte_clamp on public.reporte_diario;
drop trigger if exists trg_reporte_tope  on public.reporte_diario;

create trigger trg_reporte_tope
  before insert or update of porcentaje_avance_dia, servicio_id on public.reporte_diario
  for each row
  execute function public.fn_reporte_clamp_avance();

-- 2 — Recálculo: acumulado por servicio y global como media de servicios.
create or replace function public.recalcular_avance_seguimiento(p_seguimiento_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_servicios int[];
  v_srv       int;
  v_acum      numeric(5,2) := 0;
  v_global    numeric(5,2) := 0;
  v_row       record;
begin
  -- Acumulado de cada parte, dentro de su servicio y en orden de fecha.
  for v_row in
    select id, servicio_id, porcentaje_avance_dia
      from reporte_diario
     where seguimiento_id = p_seguimiento_id
     order by servicio_id, fecha asc, creado_en asc, id asc
  loop
    if v_row.servicio_id is distinct from v_srv then
      v_srv  := v_row.servicio_id;
      v_acum := 0;
    end if;
    v_acum := least(v_acum + v_row.porcentaje_avance_dia, 100);
    update reporte_diario
       set porcentaje_acumulado = v_acum
     where id = v_row.id;
  end loop;

  -- Servicios del contrato; sin ellos, el principal del expediente.
  select case when cardinality(c.servicio_ids) > 0 then c.servicio_ids
              else array[e.servicio_id] end
    into v_servicios
    from seguimiento_obra s
    join contrato   c on c.id = s.contrato_id
    join expediente e on e.id = s.expediente_id
   where s.id = p_seguimiento_id;

  -- Global: media del avance de cada servicio (un servicio sin partes cuenta 0).
  select coalesce(avg(least(coalesce(t.total, 0), 100)), 0)
    into v_global
    from unnest(coalesce(v_servicios, '{}')) as x(servicio_id)
    left join (
      select servicio_id, sum(porcentaje_avance_dia) as total
        from reporte_diario
       where seguimiento_id = p_seguimiento_id
       group by servicio_id
    ) t on t.servicio_id = x.servicio_id;

  -- El estado sale del avance en los dos sentidos: al 100 % se completa y, si
  -- vuelve a bajar (se borra un parte, o con esta regla un servicio sigue sin
  -- avanzar), deja de estarlo. Esta función es la única que lo marca.
  update seguimiento_obra
     set porcentaje_avance = v_global,
         estado            = case
                               when v_global >= 100     then 'completado'::estado_seguimiento
                               when estado = 'completado' then 'en_progreso'::estado_seguimiento
                               else estado
                             end,
         fecha_fin_real    = case
                               when v_global >= 100 and fecha_fin_real is null then now()
                               when v_global < 100  then null
                               else fecha_fin_real
                             end,
         actualizado_en    = now()
   where id = p_seguimiento_id;
end;
$function$;

-- 3 — Cambiar el servicio de un parte también mueve su avance: recalcular.
drop trigger if exists trg_reporte_seguimiento on public.reporte_diario;

create trigger trg_reporte_seguimiento
  after insert or update of porcentaje_avance_dia, fase_id, hora_inicio, fecha, servicio_id
  on public.reporte_diario
  for each row
  execute function public.fn_reporte_actualiza_seguimiento();

-- 4 — Recalcular todas las obras con la regla nueva.
select public.recalcular_avance_seguimiento(id) from public.seguimiento_obra;

notify pgrst, 'reload schema';
