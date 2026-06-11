-- Storage policies for report media files
-- Bucket: archivos  |  Path: reportes/**
--
-- Constructor uploads photos/videos/documents for their daily reports.
-- All authenticated users with report access can read.
-- Uploader can delete their own files.

DROP POLICY IF EXISTS "reportes_insert_auth" ON storage.objects;
CREATE POLICY "reportes_insert_auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'archivos'
  AND name LIKE 'reportes/%'
);

DROP POLICY IF EXISTS "reportes_select_auth" ON storage.objects;
CREATE POLICY "reportes_select_auth"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'archivos'
  AND name LIKE 'reportes/%'
);

DROP POLICY IF EXISTS "reportes_delete_auth" ON storage.objects;
CREATE POLICY "reportes_delete_auth"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'archivos'
  AND name LIKE 'reportes/%'
);
