-- ============================================================
-- Invitación a constructores: también la hace el estimador
--
-- La sección «Invitación a constructores» existía solo en el
-- panel del administrador. Ahora el estimador la tiene en el
-- expediente que está estimando (estimator/file-to-be-estimated)
-- y debe funcionar igual, así que las políticas de
-- expediente_invitacion se abren al rol estimador:
--
--   · SELECT — ver qué constructores ya están invitados (sin
--     esto la lista se pinta siempre «sin invitar», porque RLS
--     filtra las filas en silencio, sin error).
--   · DELETE — «Todos los Constructores» retira las
--     invitaciones por correo y el expediente vuelve a ser
--     público (sin esto el borrado no afecta a ninguna fila y
--     la acción parece funcionar sin hacer nada).
--   · INSERT — vía directa adicional; el alta real la sigue
--     haciendo la edge function `enviar-invitacion` con service
--     role, que también admite ya al estimador.
--
-- El resto de ramas (cliente, constructor) queda intacto: el
-- constructor sigue viendo únicamente sus propias invitaciones.
-- ============================================================

-- Admin y estimador ven todas; el constructor solo las suyas
DROP POLICY IF EXISTS "inv_select" ON expediente_invitacion;
CREATE POLICY "inv_select"
ON expediente_invitacion FOR SELECT TO authenticated
USING (
  constructor_id = auth.uid()
  OR mi_rol() IN ('administrador', 'estimador')
);

-- Admin y estimador insertan / eliminan desde el cliente
DROP POLICY IF EXISTS "inv_insert_admin" ON expediente_invitacion;
DROP POLICY IF EXISTS "inv_insert" ON expediente_invitacion;
CREATE POLICY "inv_insert"
ON expediente_invitacion FOR INSERT TO authenticated
WITH CHECK (mi_rol() IN ('administrador', 'estimador'));

DROP POLICY IF EXISTS "inv_delete_admin" ON expediente_invitacion;
DROP POLICY IF EXISTS "inv_delete" ON expediente_invitacion;
CREATE POLICY "inv_delete"
ON expediente_invitacion FOR DELETE TO authenticated
USING (mi_rol() IN ('administrador', 'estimador'));
