-- ============================================================
-- RLS en tablas expediente y localizacion
--
-- Operaciones UPDATE verificadas en el código:
--   asignarEstimador  → SET estado='en_estimacion', estimador_id=X WHERE id=?
--   actualizarEstado  → SET estado=X WHERE id=?  (estimador marca como 'estimado')
--   liberar           → SET estado='nuevo', estimador_id=null WHERE id=?
--   oferta.enviar()   → SET estado='en_oferta' WHERE id=? (constructor)
--   aceptar_oferta()  → SECURITY DEFINER, no requiere RLS UPDATE
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- TABLA: expediente
-- ══════════════════════════════════════════════════════════════

ALTER TABLE expediente ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────

-- Cliente ve sus propios expedientes
DROP POLICY IF EXISTS "exp_select_cliente"    ON expediente;
CREATE POLICY "exp_select_cliente"
ON expediente FOR SELECT TO authenticated
USING (cliente_id = auth.uid());

-- Estimador ve los 'nuevo' (para asignarse) y los propios asignados
DROP POLICY IF EXISTS "exp_select_estimador"  ON expediente;
CREATE POLICY "exp_select_estimador"
ON expediente FOR SELECT TO authenticated
USING (
  (estado = 'nuevo' OR estimador_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'estimador'
  )
);

-- Constructor ve los disponibles para ofertar
DROP POLICY IF EXISTS "exp_select_constructor" ON expediente;
CREATE POLICY "exp_select_constructor"
ON expediente FOR SELECT TO authenticated
USING (
  estado IN ('estimado', 'en_oferta')
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'constructor'
  )
);

-- Administrador ve todos
DROP POLICY IF EXISTS "exp_select_admin"       ON expediente;
CREATE POLICY "exp_select_admin"
ON expediente FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'administrador')
);

-- ── INSERT ───────────────────────────────────────────────────

-- Solo el cliente puede crear expedientes, y cliente_id debe ser el suyo
DROP POLICY IF EXISTS "exp_insert_cliente"     ON expediente;
CREATE POLICY "exp_insert_cliente"
ON expediente FOR INSERT TO authenticated
WITH CHECK (
  cliente_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol IN ('cliente', 'administrador')
  )
);

-- ── UPDATE ───────────────────────────────────────────────────

-- Estimador actualiza expedientes 'nuevo' (asignar) o los suyos (progresar/liberar)
-- WITH CHECK: el nuevo estimador_id debe ser el suyo o NULL (liberar)
DROP POLICY IF EXISTS "exp_update_estimador"   ON expediente;
CREATE POLICY "exp_update_estimador"
ON expediente FOR UPDATE TO authenticated
USING (
  (estado = 'nuevo' OR estimador_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'estimador'
  )
)
WITH CHECK (
  (estimador_id = auth.uid() OR estimador_id IS NULL)
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'estimador'
  )
);

-- Constructor actualiza el estado a 'en_oferta' cuando envía una oferta
DROP POLICY IF EXISTS "exp_update_constructor" ON expediente;
CREATE POLICY "exp_update_constructor"
ON expediente FOR UPDATE TO authenticated
USING (
  estado IN ('estimado', 'en_oferta')
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'constructor'
  )
)
WITH CHECK (
  estado = 'en_oferta'
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'constructor'
  )
);

-- Administrador puede actualizar cualquier expediente
DROP POLICY IF EXISTS "exp_update_admin"       ON expediente;
CREATE POLICY "exp_update_admin"
ON expediente FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'administrador')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'administrador')
);


-- ══════════════════════════════════════════════════════════════
-- TABLA: localizacion
-- ══════════════════════════════════════════════════════════════

ALTER TABLE localizacion ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────

-- Cliente ve localizaciones de sus expedientes
DROP POLICY IF EXISTS "loc_select_cliente"     ON localizacion;
CREATE POLICY "loc_select_cliente"
ON localizacion FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = localizacion.expediente_id
      AND e.cliente_id = auth.uid()
  )
);

-- Estimador ve localizaciones de expedientes 'nuevo' y de los suyos
DROP POLICY IF EXISTS "loc_select_estimador"   ON localizacion;
CREATE POLICY "loc_select_estimador"
ON localizacion FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = localizacion.expediente_id
      AND (e.estado = 'nuevo' OR e.estimador_id = auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'estimador'
  )
);

-- Constructor ve localizaciones de expedientes disponibles
DROP POLICY IF EXISTS "loc_select_constructor" ON localizacion;
CREATE POLICY "loc_select_constructor"
ON localizacion FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = localizacion.expediente_id
      AND e.estado IN ('estimado', 'en_oferta')
  )
  AND EXISTS (
    SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'constructor'
  )
);

-- Administrador ve todas las localizaciones
DROP POLICY IF EXISTS "loc_select_admin"       ON localizacion;
CREATE POLICY "loc_select_admin"
ON localizacion FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'administrador')
);

-- ── INSERT ───────────────────────────────────────────────────

-- Solo el cliente (o admin) puede insertar localizacion vinculada a su expediente
DROP POLICY IF EXISTS "loc_insert_cliente"     ON localizacion;
CREATE POLICY "loc_insert_cliente"
ON localizacion FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = localizacion.expediente_id
      AND e.cliente_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "loc_insert_admin"       ON localizacion;
CREATE POLICY "loc_insert_admin"
ON localizacion FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM perfil WHERE id = auth.uid() AND rol = 'administrador')
);
