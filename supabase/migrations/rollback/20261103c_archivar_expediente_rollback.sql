-- Rollback de `20261103c_archivar_expediente.sql`.
--
-- Quita la RPC y las guardias, y devuelve recalcular_avance_seguimiento a la
-- versión de `20261103_completar_contrato_cierra_obra.sql`. No desarchiva
-- nada: para eso, el rollback de `20261103b_estado_archivado.sql`.

drop function if exists public.archivar_expediente_admin(uuid);

drop trigger if exists trg_guardia_seguimiento_archivado on public.seguimiento_obra;
drop trigger if exists trg_guardia_reporte_archivado     on public.reporte_diario;
drop trigger if exists trg_guardia_expediente_archivado  on public.contrato;
drop trigger if exists trg_guardia_expediente_archivado  on public.oferta;
drop trigger if exists trg_guardia_archivado             on public.contrato;
drop trigger if exists trg_guardia_archivado             on public.oferta;
drop trigger if exists trg_guardia_archivado             on public.expediente;

drop function if exists public.fn_guardia_seguimiento_archivado();
drop function if exists public.fn_guardia_reporte_archivado();
drop function if exists public.fn_guardia_expediente_archivado();
drop function if exists public.fn_guardia_archivado();

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
