-- =====================================================================
-- El ESTIMADOR debe poder LEER el seguimiento de obra de los expedientes
-- QUE ÉL ESTIMÓ, no solo de los que tiene asignados ahora mismo.
--
-- Problema: todas las políticas de lectura del bloque de seguimiento
-- (contrato, seguimiento_obra, reporte_diario, inspeccion) resolvían el
-- acceso del estimador con `expediente.estimador_id = auth.uid()`, que es
-- la ASIGNACIÓN ACTUAL. Esa columna se reescribe al reasignar el
-- expediente a otro estimador y se pone a NULL al desasignarlo
-- (ver ExpedienteRepository.desasignarEstimador). En cuanto eso ocurre, el
-- estimador que hizo la estimación deja de ver la obra: la lista sale
-- vacía y el detalle no muestra nada, sin ningún mensaje, porque RLS
-- filtra las filas en silencio.
--
-- Solución: quien estimó el expediente queda registrado de forma estable
-- en `estimacion.estimador_id`. Se añade una función que acepta las dos
-- vías —asignado ahora O autor de la estimación— y se usa en las cuatro
-- políticas de SELECT.
--
-- Solo amplía lectura para el rol `estimador`. No toca cliente,
-- constructor ni administrador, ni ninguna política de escritura.
-- =====================================================================
begin;

-- SECURITY DEFINER para poder leer `expediente` y `estimacion` desde
-- dentro de las políticas sin quedar sujeta a la RLS de esas tablas
-- (evita la recursión y los falsos negativos).
create or replace function public.fn_estimador_de_expediente(p_expediente_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from expediente e
    where e.id = p_expediente_id
      and e.estimador_id = auth.uid()
  ) or exists (
    select 1 from estimacion es
    where es.expediente_id = p_expediente_id
      and es.estimador_id = auth.uid()
  );
$$;

comment on function public.fn_estimador_de_expediente(uuid) is
  'True si el usuario actual es el estimador asignado al expediente o el autor de su estimación.';

-- Postgres concede EXECUTE a PUBLIC por defecto, lo que dejaría la función
-- expuesta como RPC a `anon`. Las políticas que la usan son `to authenticated`,
-- así que `anon` nunca la evalúa: revocar PUBLIC no cambia el comportamiento y
-- quita superficie de API innecesaria.
revoke execute on function public.fn_estimador_de_expediente(uuid) from public;
revoke execute on function public.fn_estimador_de_expediente(uuid) from anon;
grant  execute on function public.fn_estimador_de_expediente(uuid) to authenticated;

-- ── contrato ────────────────────────────────────────────────────────────
drop policy if exists contrato_select on contrato;
create policy contrato_select on contrato for select to authenticated
using (
  cliente_id = auth.uid()
  or constructor_id = auth.uid()
  or mi_rol() = 'administrador'::rol_usuario
  or (mi_rol() = 'estimador'::rol_usuario and fn_estimador_de_expediente(contrato.expediente_id))
);

-- ── seguimiento_obra ────────────────────────────────────────────────────
drop policy if exists seguimiento_obra_select on seguimiento_obra;
create policy seguimiento_obra_select on seguimiento_obra for select to authenticated
using (
  fn_rol_actual() = 'administrador'
  or constructor_id = auth.uid()
  or exists (
    select 1 from expediente e
    where e.id = seguimiento_obra.expediente_id
      and (e.cliente_id = auth.uid() or fn_estimador_de_expediente(e.id))
  )
);

-- ── reporte_diario ──────────────────────────────────────────────────────
drop policy if exists reporte_diario_select on reporte_diario;
create policy reporte_diario_select on reporte_diario for select to authenticated
using (
  fn_rol_actual() = 'administrador'
  or constructor_id = auth.uid()
  or exists (
    select 1 from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = reporte_diario.seguimiento_id
      and (e.cliente_id = auth.uid() or fn_estimador_de_expediente(e.id))
  )
);

-- ── inspeccion ──────────────────────────────────────────────────────────
drop policy if exists inspeccion_select on inspeccion;
create policy inspeccion_select on inspeccion for select to authenticated
using (
  fn_rol_actual() = 'administrador'
  or exists (
    select 1 from seguimiento_obra s
    join expediente e on e.id = s.expediente_id
    where s.id = inspeccion.seguimiento_id
      and (
        s.constructor_id = auth.uid()
        or e.cliente_id = auth.uid()
        or fn_estimador_de_expediente(e.id)
      )
  )
);

commit;
