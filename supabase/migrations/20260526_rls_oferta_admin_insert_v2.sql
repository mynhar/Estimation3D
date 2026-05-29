-- Fix: remove self-referential COUNT subquery from oferta_insert policy.
--
-- The previous policy contained (SELECT COUNT(*) FROM oferta ...) inside
-- the WITH CHECK clause.  PostgreSQL detects this as infinite recursion
-- because evaluating the INSERT policy triggers a SELECT on the same
-- relation, which re-enters RLS evaluation.
--
-- The 5-offer-per-expediente limit is already enforced by the BEFORE INSERT
-- trigger trg_limite_ofertas_expediente (see 20260506_limite_ofertas_expediente).
-- That trigger is a hard DB constraint and is the sole enforcer of the cap.
--
-- The admin path (no constructor_id = auth.uid() requirement) is preserved
-- so that administrators can create offers on behalf of any constructor.
-- APPLIED DIRECTLY (2026-05-28): migration skipped by supabase push due to
-- version conflict; SQL was executed via db query.

DROP POLICY IF EXISTS "oferta_insert" ON oferta;

CREATE POLICY "oferta_insert"
ON oferta
FOR INSERT
TO authenticated
WITH CHECK (
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
);
