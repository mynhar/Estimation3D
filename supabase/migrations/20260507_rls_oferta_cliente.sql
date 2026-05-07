-- Permite al cliente leer las ofertas de sus propios expedientes.
-- Necesario para que offers-received pueda contar ofertas por expediente.
-- Se combina con las políticas del constructor/admin via OR (RLS permissive).

DROP POLICY IF EXISTS "oferta_select_cliente" ON oferta;

CREATE POLICY "oferta_select_cliente"
ON oferta
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id    = oferta.expediente_id
      AND e.cliente_id = auth.uid()
  )
);
