-- Completar un contrato cierra también su obra.
--
-- Requiere `20261019_avance_por_servicio.sql` y
-- `20260527_rpc_completar_contrato_admin.sql`.
--
-- «Marcar como completado» (admin/contract/edit, y «Completar contrato» en el
-- seguimiento en modo admin) solo cambiaba `contrato.estado`. La obra se quedaba
-- con el avance que sumaran los partes y en el estado que tuviera. Ahora, en la
-- misma transacción:
--
--   · contrato.estado                     → 'completado'
--   · seguimiento_obra.estado             → 'completado'
--   · seguimiento_obra.porcentaje_avance  → 100
--   · seguimiento_obra.fecha_fin_real     → now(); si la obra ya había llegado
--                                           sola al 100 %, conserva esa fecha.
--
-- `recalcular_avance_seguimiento` saca el avance de los partes, y la pantalla
-- de seguimiento deja borrar partes con el contrato completado: el siguiente
-- recálculo bajaría la obra otra vez. Por eso, con el contrato completado, el
-- avance global queda fijo en 100 %. El acumulado de cada parte
-- (`reporte_diario.porcentaje_acumulado`) se sigue calculando igual.
--
-- De paso, la comprobación de rol pasa a ser segura ante NULL: con
-- `v_rol <> 'administrador'`, un usuario sin fila en `perfil` la saltaba.

-- 1 — completar_contrato_admin cierra el seguimiento.
create or replace function public.completar_contrato_admin(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol    text;
  v_estado text;
begin
  select rol into v_rol
  from public.perfil
  where id = auth.uid();

  if v_rol is distinct from 'administrador' then
    raise exception 'No autorizado: se requiere rol administrador.';
  end if;

  select estado
    into v_estado
  from public.contrato
  where id = p_contrato_id
  for update;

  if not found then
    raise exception 'Contrato no encontrado.';
  end if;

  if v_estado <> 'en_ejecucion' then
    raise exception 'Solo se puede completar un contrato en estado ''en_ejecucion'' (estado actual: %).', v_estado;
  end if;

  update public.contrato
  set estado         = 'completado',
      actualizado_en = now()
  where id = p_contrato_id;

  -- La obra queda cerrada al 100 %, aunque los partes no sumen tanto.
  update public.seguimiento_obra
  set estado            = 'completado',
      porcentaje_avance = 100,
      fecha_fin_real    = coalesce(fecha_fin_real, now()),
      actualizado_en    = now()
  where contrato_id = p_contrato_id;
end;
$function$;

-- 2 — recalcular_avance_seguimiento no reabre una obra de contrato completado.
--     Igual que la versión de `20261019_avance_por_servicio.sql` salvo que lee
--     el estado del contrato y, si está completado, fija el global en 100.
create or replace function public.recalcular_avance_seguimiento(p_seguimiento_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_servicios       int[];
  v_contrato_estado estado_contrato;
  v_srv             int;
  v_acum            numeric(5,2) := 0;
  v_global          numeric(5,2) := 0;
  v_row             record;
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
              else array[e.servicio_id] end,
         c.estado
    into v_servicios, v_contrato_estado
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

  -- Contrato completado: la obra la cerró el administrador al 100 %
  -- (completar_contrato_admin) y borrar o corregir un parte no la reabre.
  if v_contrato_estado = 'completado' then
    v_global := 100;
  end if;

  -- El estado sale del avance en los dos sentidos: al 100 % se completa y, si
  -- vuelve a bajar (se borra un parte, o con esta regla un servicio sigue sin
  -- avanzar), deja de estarlo. Fuera de esta función, solo
  -- completar_contrato_admin lo marca.
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
