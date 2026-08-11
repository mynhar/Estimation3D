-- La política FOR ALL `estimacion_insert_update_estimador` concedía a CUALQUIER
-- estimador insert/update/delete sobre CUALQUIER estimación. Al ser permisiva se
-- combinaba con OR, anulando las dos políticas estrechas que ya existían
-- ("solo estimadores insertan" y "estimador actualiza la suya"). Se sustituyen
-- las tres por una por comando, con el mismo criterio de pertenencia que usan
-- contrato_select e inspeccion_select: fn_estimador_de_expediente().

drop policy if exists "estimacion_insert_update_estimador" on public.estimacion;
drop policy if exists "estimacion: solo estimadores insertan" on public.estimacion;
drop policy if exists "estimacion: estimador actualiza la suya, admin cualquiera" on public.estimacion;

-- El estimador firma su propia estimación; el administrador puede crearla a
-- nombre del estimador que elija en la pantalla de asignación.
create policy "estimacion_insert" on public.estimacion
  for insert to authenticated
  with check (
    mi_rol() = 'administrador'::rol_usuario
    or (mi_rol() = 'estimador'::rol_usuario and estimador_id = auth.uid())
  );

-- Actualiza quien tiene el expediente asignado o quien firmó la estimación.
-- `expediente_id` no cambia en ningún flujo, así que USING y WITH CHECK
-- evalúan lo mismo antes y después de la fila.
create policy "estimacion_update" on public.estimacion
  for update to authenticated
  using (
    mi_rol() = 'administrador'::rol_usuario
    or (mi_rol() = 'estimador'::rol_usuario and fn_estimador_de_expediente(expediente_id))
  )
  with check (
    mi_rol() = 'administrador'::rol_usuario
    or (mi_rol() = 'estimador'::rol_usuario and fn_estimador_de_expediente(expediente_id))
  );

-- Antes no existía política DELETE propia: borraba cualquier estimador vía FOR ALL.
create policy "estimacion_delete" on public.estimacion
  for delete to authenticated
  using (
    mi_rol() = 'administrador'::rol_usuario
    or (mi_rol() = 'estimador'::rol_usuario and fn_estimador_de_expediente(expediente_id))
  );
