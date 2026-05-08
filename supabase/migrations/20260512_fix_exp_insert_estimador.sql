-- ============================================================
-- FIX: permitir que usuarios con rol 'estimador' puedan crear
-- expedientes como clientes (cliente_id = auth.uid()).
--
-- El rol 'estimador' no estaba incluido en la política de INSERT
-- de la tabla expediente, por lo que el INSERT era rechazado por
-- RLS sin mostrar un error claro en el frontend.
-- ============================================================

DROP POLICY IF EXISTS "exp_insert_cliente" ON expediente;

CREATE POLICY "exp_insert_cliente"
ON expediente FOR INSERT TO authenticated
WITH CHECK (
  cliente_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid()
      AND rol IN ('cliente', 'estimador', 'administrador')
  )
);
