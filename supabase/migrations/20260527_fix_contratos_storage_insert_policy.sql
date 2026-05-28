-- FIX: La política de INSERT en storage.objects para el bucket 'contratos'
-- sólo permitía al rol 'cliente' subir PDFs.
-- El administrador también necesita INSERT para generar el PDF al adjudicar una oferta.

DROP POLICY IF EXISTS "contratos storage: cliente sube pdf" ON storage.objects;

CREATE POLICY "contratos storage: cliente o admin sube pdf"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'contratos'
  AND mi_rol() IN ('cliente', 'administrador')
);
