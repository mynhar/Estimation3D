-- `inspeccion` tenía tres políticas FOR ALL (constructor+admin, cliente,
-- estimador). Dos problemas:
--   1. FOR ALL cubre también SELECT, así que las tres se combinaban con OR sobre
--      `inspeccion_select`, que es la política de lectura deliberada.
--   2. La rama del estimador usaba `expediente.estimador_id = auth.uid()`,
--      mientras que `inspeccion_select` usa fn_estimador_de_expediente(). El
--      estimador que firmó la estimación de un expediente reasignado veía la
--      agenda pero no podía agendar ni eliminar visitas.
-- Se reemplazan por políticas explícitas por comando; la lectura queda solo en
-- manos de `inspeccion_select`.

drop policy if exists "inspeccion_write" on public.inspeccion;
drop policy if exists "inspeccion_write_cliente" on public.inspeccion;
drop policy if exists "inspeccion_write_estimador" on public.inspeccion;

-- Partes con derecho a agendar/modificar visitas de un seguimiento de obra:
-- administrador, constructor de la obra, cliente del expediente y estimador del
-- expediente (asignado o autor de la estimación).
create or replace function public.fn_parte_de_seguimiento(p_seguimiento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select fn_rol_actual() = 'administrador'
      or exists (
        select 1
        from seguimiento_obra s
        join expediente e on e.id = s.expediente_id
        where s.id = p_seguimiento_id
          and (
            s.constructor_id = auth.uid()
            or e.cliente_id  = auth.uid()
            or fn_estimador_de_expediente(e.id)
          )
      );
$$;

revoke execute on function public.fn_parte_de_seguimiento(uuid) from anon;

create policy "inspeccion_insert" on public.inspeccion
  for insert to authenticated
  with check (fn_parte_de_seguimiento(seguimiento_id) and creado_por = auth.uid());

create policy "inspeccion_update" on public.inspeccion
  for update to authenticated
  using (fn_parte_de_seguimiento(seguimiento_id))
  with check (fn_parte_de_seguimiento(seguimiento_id));

create policy "inspeccion_delete" on public.inspeccion
  for delete to authenticated
  using (fn_parte_de_seguimiento(seguimiento_id));
