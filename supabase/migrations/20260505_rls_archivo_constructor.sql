-- Permite al constructor (y administrador) leer archivos adjuntos de expedientes
-- que estén en estado 'estimado' o 'en_oferta'.
-- Necesario para que make-offer muestre los archivos del informe del estimador.

CREATE POLICY "constructor_lee_archivos_expediente"
ON archivo
FOR SELECT
TO authenticated
USING (
  expediente_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = archivo.expediente_id
      AND e.estado IN ('estimado', 'en_oferta')
  )
  AND EXISTS (
    SELECT 1 FROM perfil p
    WHERE p.id = auth.uid()
      AND p.rol IN ('constructor', 'administrador')
  )
);
