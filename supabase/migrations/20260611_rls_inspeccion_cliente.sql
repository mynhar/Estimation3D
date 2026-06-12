-- =====================================================================
-- El CLIENTE (dueño del expediente) puede gestionar las inspecciones de
-- SUS obras: agendar (insert) y eliminar (delete), igual que el constructor
-- adjudicado. La política inspeccion_write previa solo cubría admin y
-- constructor. Se combinan por OR, así que el constructor conserva su acceso.
-- =====================================================================
begin;

drop policy if exists inspeccion_write_cliente on inspeccion;
create policy inspeccion_write_cliente on inspeccion for all to authenticated
using (
  exists (
    select 1
    from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = inspeccion.seguimiento_id
      and e.cliente_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = inspeccion.seguimiento_id
      and e.cliente_id = auth.uid()
  )
);

commit;
