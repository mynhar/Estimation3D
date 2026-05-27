-- Allow constructors to delete their own offers,
-- and admins to delete any offer,
-- blocked when the expediente is adjudicado or contratado.
CREATE POLICY "oferta_delete"
ON oferta FOR DELETE TO authenticated
USING (
  NOT EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = oferta.expediente_id
      AND e.estado IN ('adjudicado'::estado_expediente, 'contratado'::estado_expediente)
  )
  AND (
    constructor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM perfil
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  )
);
