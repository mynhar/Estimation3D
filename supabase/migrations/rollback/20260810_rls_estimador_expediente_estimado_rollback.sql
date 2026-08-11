-- =====================================================================
-- ROLLBACK de 20260810_rls_estimador_expediente_estimado.sql
--
-- Restaura las cuatro políticas de SELECT tal y como estaban en
-- producción (proyecto ckdksfvxjimxuqceoeyr) antes de aplicar la
-- migración, capturadas de pg_policies el 2026-08-10.
--
-- NO se ejecuta automáticamente. Solo por si hay que revertir.
-- =====================================================================
begin;

drop policy if exists contrato_select on contrato;
create policy contrato_select on contrato for select to authenticated
using (
  cliente_id = auth.uid()
  or constructor_id = auth.uid()
  or mi_rol() = 'administrador'::rol_usuario
  or (
    mi_rol() = 'estimador'::rol_usuario
    and exists (
      select 1 from expediente e
      where e.id = contrato.expediente_id and e.estimador_id = auth.uid()
    )
  )
);

drop policy if exists seguimiento_obra_select on seguimiento_obra;
create policy seguimiento_obra_select on seguimiento_obra for select to authenticated
using (
  fn_rol_actual() = 'administrador'::text
  or constructor_id = auth.uid()
  or exists (
    select 1 from expediente e
    where e.id = seguimiento_obra.expediente_id
      and (e.cliente_id = auth.uid() or e.estimador_id = auth.uid())
  )
);

drop policy if exists reporte_diario_select on reporte_diario;
create policy reporte_diario_select on reporte_diario for select to authenticated
using (
  fn_rol_actual() = 'administrador'::text
  or constructor_id = auth.uid()
  or exists (
    select 1
    from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = reporte_diario.seguimiento_id
      and (e.cliente_id = auth.uid() or e.estimador_id = auth.uid())
  )
);

drop policy if exists inspeccion_select on inspeccion;
create policy inspeccion_select on inspeccion for select to authenticated
using (
  fn_rol_actual() = 'administrador'::text
  or exists (
    select 1
    from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = inspeccion.seguimiento_id
      and (
        s.constructor_id = auth.uid()
        or e.cliente_id = auth.uid()
        or e.estimador_id = auth.uid()
      )
  )
);

-- La función queda huérfana pero inocua. Para eliminarla también:
-- drop function if exists public.fn_estimador_de_expediente(uuid);

commit;
