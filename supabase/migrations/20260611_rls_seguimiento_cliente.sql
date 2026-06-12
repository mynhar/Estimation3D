-- =====================================================================
-- Lectura (solo SELECT) del seguimiento de obra para el CLIENTE dueño
-- del expediente. Necesario para la vista client/construction-monitoring.
--
-- Las políticas previas de reporte_actividad / reporte_zona y de la media
-- de reportes (archivo.reporte_id) solo permitían admin/constructor. El
-- cliente ya puede leer seguimiento_obra, reporte_diario e inspeccion;
-- estas tres políticas completan el acceso de lectura que faltaba.
-- =====================================================================
begin;

-- Media (fotos/videos/documentos) adjunta a reportes diarios de SUS obras.
-- La media de reporte se inserta con reporte_id (sin expediente_id), por lo
-- que las políticas de cliente existentes (basadas en expediente_id) no la
-- cubren.
drop policy if exists archivo_select_cliente_reporte on archivo;
create policy archivo_select_cliente_reporte on archivo for select to authenticated
using (
  reporte_id is not null
  and exists (
    select 1
    from reporte_diario r
    join seguimiento_obra s on s.id = r.seguimiento_id
    join expediente e on e.id = s.expediente_id
    where r.id = archivo.reporte_id
      and e.cliente_id = auth.uid()
  )
);

-- Actividades realizadas en cada reporte diario de SUS obras.
drop policy if exists reporte_act_select_cliente on reporte_actividad;
create policy reporte_act_select_cliente on reporte_actividad for select to authenticated
using (
  exists (
    select 1
    from reporte_diario r
    join seguimiento_obra s on s.id = r.seguimiento_id
    join expediente e on e.id = s.expediente_id
    where r.id = reporte_actividad.reporte_id
      and e.cliente_id = auth.uid()
  )
);

-- Desglose por zona de cada reporte diario de SUS obras.
drop policy if exists reporte_zona_select_cliente on reporte_zona;
create policy reporte_zona_select_cliente on reporte_zona for select to authenticated
using (
  exists (
    select 1
    from reporte_diario r
    join seguimiento_obra s on s.id = r.seguimiento_id
    join expediente e on e.id = s.expediente_id
    where r.id = reporte_zona.reporte_id
      and e.cliente_id = auth.uid()
  )
);

commit;
