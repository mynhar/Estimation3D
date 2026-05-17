-- ============================================================
-- Políticas de Storage para avatares de usuario
--
-- Bucket: archivos  |  Path: avatares/**
--
-- INSERT/UPDATE: cualquier usuario autenticado puede subir
--   a avatares/ (la convención de nombre userId.ext garantiza
--   la organización; admins también suben avatares de otros).
-- SELECT: lectura pública (el navbar, listas y correos necesitan
--   mostrar el avatar sin token).
-- DELETE: cada usuario borra solo su propio avatar.
-- ============================================================

-- ── INSERT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatares_insert_auth" ON storage.objects;
CREATE POLICY "avatares_insert_auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'archivos'
  AND name   LIKE 'avatares/%'
);

-- ── UPDATE (necesario para upsert:true) ──────────────────────
DROP POLICY IF EXISTS "avatares_update_auth" ON storage.objects;
CREATE POLICY "avatares_update_auth"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'archivos'
  AND name   LIKE 'avatares/%'
);

-- ── SELECT (lectura pública) ──────────────────────────────────
DROP POLICY IF EXISTS "avatares_select_public" ON storage.objects;
CREATE POLICY "avatares_select_public"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'archivos'
  AND name   LIKE 'avatares/%'
);

-- ── DELETE (el propio usuario borra su avatar) ────────────────
DROP POLICY IF EXISTS "avatares_delete_owner" ON storage.objects;
CREATE POLICY "avatares_delete_owner"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'archivos'
  AND name   LIKE 'avatares/%'
  AND auth.uid()::text = split_part(split_part(name, '/', 2), '.', 1)
);
