-- ============================================================
-- Fix: allow admin to create offers on behalf of any constructor.
--
-- The previous oferta_insert policy required constructor_id = auth.uid(),
-- which blocked admins because their UID differs from the selected
-- constructor's ID.  The updated policy splits the check:
--   · Constructor path: constructor_id must equal the caller (unchanged).
--   · Admin path: any constructor_id is allowed, no UID match needed.
-- The 5-offer-per-expediente cap applies in both paths.
-- ============================================================

DROP POLICY IF EXISTS "oferta_insert" ON oferta;

CREATE POLICY "oferta_insert"
ON oferta
FOR INSERT
TO authenticated
WITH CHECK (
  (
    -- Normal path: constructor inserts their own offer
    (
      constructor_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM perfil
        WHERE id = auth.uid()
          AND rol IN ('constructor', 'administrador')
      )
    )
    OR
    -- Admin path: may create on behalf of any constructor
    EXISTS (
      SELECT 1 FROM perfil
      WHERE id = auth.uid()
        AND rol = 'administrador'
    )
  )
  AND (
    SELECT COUNT(*) FROM oferta o
    WHERE o.expediente_id = expediente_id
  ) < 5
);
