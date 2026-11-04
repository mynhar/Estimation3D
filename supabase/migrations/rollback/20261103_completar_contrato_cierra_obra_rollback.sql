-- Rollback de `20261103_completar_contrato_cierra_obra.sql`.
--
-- Vuelve a las definiciones vigentes antes de la migración (copiadas de
-- producción): completar_contrato_admin solo cambia el contrato y
-- recalcular_avance_seguimiento no mira el estado del contrato.
-- No deshace los seguimientos que ya se cerraron al 100 % al completar.

create or replace function public.completar_contrato_admin(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_rol    text;
  v_estado text;
BEGIN
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  IF v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  SELECT estado
    INTO v_estado
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  IF v_estado <> 'en_ejecucion' THEN
    RAISE EXCEPTION 'Solo se puede completar un contrato en estado ''en_ejecucion'' (estado actual: %).', v_estado;
  END IF;

  UPDATE public.contrato
  SET estado         = 'completado',
      actualizado_en = now()
  WHERE id = p_contrato_id;
END;
$function$;

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
