-- Allow admins to delete any file in the archivos bucket
-- (needed when deleting offer files uploaded by constructors).
CREATE POLICY "archivos_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'archivos'
  AND NOT (name LIKE 'avatares/%')
  AND EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid() AND rol = 'administrador'
  )
);
