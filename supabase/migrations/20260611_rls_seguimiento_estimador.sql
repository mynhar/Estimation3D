-- =====================================================================
-- El ESTIMADOR puede LEER (solo SELECT) el seguimiento de obra de los
-- expedientes que él estimó, para mostrar el avance de los trabajos en su
-- dashboard. Mismo patrón que contrato_select_estimador.
-- =====================================================================
begin;

drop policy if exists seguimiento_select_estimador on seguimiento_obra;
create policy seguimiento_select_estimador on seguimiento_obra for select to authenticated
using (
  exists (
    select 1 from expediente e
    where e.id = seguimiento_obra.expediente_id
      and e.estimador_id = auth.uid()
  )
  and exists (select 1 from perfil where id = auth.uid() and rol = 'estimador')
);

commit;
