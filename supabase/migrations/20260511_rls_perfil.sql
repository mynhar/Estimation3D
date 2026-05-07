-- ============================================================
-- RLS en tabla perfil
--
-- Razón: la tabla podía tener RLS habilitado desde el dashboard
-- sin política de SELECT para otros usuarios, haciendo que
-- lecturas cruzadas (cliente → perfil del constructor) retornen
-- 0 filas en lugar de un error, por eso el nombre aparecía como '—'.
--
-- Política de lectura: cualquier usuario autenticado puede leer
-- cualquier perfil (necesario para mostrar nombre/tel/email del
-- constructor en ofertas, nombre del estimador en expedientes, etc.)
-- Solo el propio usuario puede escribir su perfil.
-- ============================================================

ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────

-- Cualquier usuario autenticado lee cualquier perfil
DROP POLICY IF EXISTS "perfil_select_authenticated" ON perfil;
CREATE POLICY "perfil_select_authenticated"
ON perfil FOR SELECT TO authenticated
USING (true);

-- ── INSERT ───────────────────────────────────────────────────

-- Solo el propio usuario inserta su perfil (savePerfilEmailFallback / trigger)
DROP POLICY IF EXISTS "perfil_insert_self" ON perfil;
CREATE POLICY "perfil_insert_self"
ON perfil FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- ── UPDATE ───────────────────────────────────────────────────

-- Solo el propio usuario actualiza su perfil (perfil component, syncGoogleProfile)
DROP POLICY IF EXISTS "perfil_update_self" ON perfil;
CREATE POLICY "perfil_update_self"
ON perfil FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
