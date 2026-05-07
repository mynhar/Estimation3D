-- ============================================================
-- RPC: aceptar_oferta
-- El cliente acepta una oferta: cambia el expediente a 'adjudicado',
-- la oferta elegida a 'aceptada' y las demás a 'rechazada'.
-- Corre con SECURITY DEFINER para poder actualizar las filas sin
-- necesitar políticas UPDATE en oferta/expediente para el rol cliente.
-- Valida que el expediente pertenezca al usuario que llama.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aceptar_oferta(
  p_expediente_id uuid,
  p_oferta_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
BEGIN
  -- 1. Verificar propiedad y estado del expediente
  SELECT estado INTO v_estado
  FROM public.expediente
  WHERE id = p_expediente_id
    AND cliente_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: el expediente no existe o no le pertenece.';
  END IF;

  IF v_estado NOT IN ('en_oferta', 'adjudicado') THEN
    RAISE EXCEPTION 'El expediente no está en un estado válido para aceptar ofertas (estado actual: %).', v_estado;
  END IF;

  -- 2. Verificar que la oferta pertenece a este expediente
  IF NOT EXISTS (
    SELECT 1 FROM public.oferta
    WHERE id = p_oferta_id
      AND expediente_id = p_expediente_id
  ) THEN
    RAISE EXCEPTION 'La oferta seleccionada no pertenece a este expediente.';
  END IF;

  -- 3. Actualizar expediente → adjudicado
  UPDATE public.expediente
  SET estado = 'adjudicado'
  WHERE id = p_expediente_id;

  -- 4. Marcar la oferta elegida → aceptada
  UPDATE public.oferta
  SET estado = 'aceptada'
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  -- 5. Rechazar las demás ofertas del mismo expediente
  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE expediente_id = p_expediente_id
    AND id <> p_oferta_id;
END;
$$;


-- ── RLS adicional: cliente lee estimaciones de sus expedientes ────────────────
-- Solo se activa si estimacion tiene RLS habilitado; es idempotente si no.

ALTER TABLE estimacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimacion_select_cliente" ON estimacion;
CREATE POLICY "estimacion_select_cliente"
ON estimacion
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = estimacion.expediente_id
      AND e.cliente_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "estimacion_select_estimador_admin" ON estimacion;
CREATE POLICY "estimacion_select_estimador_admin"
ON estimacion
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
);

DROP POLICY IF EXISTS "estimacion_insert_update_estimador" ON estimacion;
CREATE POLICY "estimacion_insert_update_estimador"
ON estimacion
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
);


-- ── RLS adicional: cliente lee archivos de sus expedientes ───────────────────
-- Complementa la política del constructor (20260505_rls_archivo_constructor).

ALTER TABLE archivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archivo_select_cliente_expediente" ON archivo;
CREATE POLICY "archivo_select_cliente_expediente"
ON archivo
FOR SELECT
TO authenticated
USING (
  expediente_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = archivo.expediente_id
      AND e.cliente_id = auth.uid()
  )
);

-- Cliente lee archivos adjuntos de ofertas en sus expedientes
DROP POLICY IF EXISTS "archivo_select_cliente_oferta" ON archivo;
CREATE POLICY "archivo_select_cliente_oferta"
ON archivo
FOR SELECT
TO authenticated
USING (
  oferta_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM oferta o
    JOIN expediente e ON e.id = o.expediente_id
    WHERE o.id = archivo.oferta_id
      AND e.cliente_id = auth.uid()
  )
);

-- Estimadores y admins pueden leer todos los archivos de expedientes
DROP POLICY IF EXISTS "archivo_select_estimador_admin" ON archivo;
CREATE POLICY "archivo_select_estimador_admin"
ON archivo
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
);

-- Estimadores y admins pueden insertar/eliminar archivos
DROP POLICY IF EXISTS "archivo_write_estimador_admin" ON archivo;
CREATE POLICY "archivo_write_estimador_admin"
ON archivo
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('estimador', 'administrador')
  )
);
