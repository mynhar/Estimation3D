-- ============================================================
-- Límite de 5 ofertas por expediente
-- Cubre tres capas: DB constraint (trigger), RLS INSERT y
-- políticas completas de acceso a la tabla oferta.
-- ============================================================


-- ── 1. TRIGGER: constraint duro en la DB ─────────────────────────────────────
-- Impide insertar una oferta cuando el expediente ya tiene 5.
-- Al ser BEFORE INSERT, el COUNT no incluye la fila nueva,
-- por lo que ">= 5" bloquea a partir de la sexta inserción.

CREATE OR REPLACE FUNCTION check_max_ofertas_por_expediente()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM oferta
    WHERE expediente_id = NEW.expediente_id
  ) >= 5 THEN
    RAISE EXCEPTION 'El expediente ya tiene el máximo de 5 ofertas permitidas.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limite_ofertas_expediente ON oferta;

CREATE TRIGGER trg_limite_ofertas_expediente
BEFORE INSERT ON oferta
FOR EACH ROW EXECUTE FUNCTION check_max_ofertas_por_expediente();


-- ── 2. RLS: habilitar y definir políticas completas en oferta ────────────────

ALTER TABLE oferta ENABLE ROW LEVEL SECURITY;

-- SELECT: constructor ve sus propias ofertas; administrador ve todas
DROP POLICY IF EXISTS "oferta_select" ON oferta;
CREATE POLICY "oferta_select"
ON oferta
FOR SELECT
TO authenticated
USING (
  constructor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid() AND rol = 'administrador'
  )
);

-- INSERT: constructor/administrador puede insertar siempre que
--   · la fila sea suya (constructor_id = auth.uid())
--   · el expediente no supere las 4 ofertas existentes (5ª sería la nueva)
--   El trigger duplica esta comprobación como capa de seguridad adicional.
DROP POLICY IF EXISTS "oferta_insert" ON oferta;
CREATE POLICY "oferta_insert"
ON oferta
FOR INSERT
TO authenticated
WITH CHECK (
  constructor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid() AND rol IN ('constructor', 'administrador')
  )
  AND (
    SELECT COUNT(*) FROM oferta o
    WHERE o.expediente_id = expediente_id
  ) < 5
);

-- UPDATE: constructor actualiza solo sus propias ofertas; administrador cualquiera
DROP POLICY IF EXISTS "oferta_update" ON oferta;
CREATE POLICY "oferta_update"
ON oferta
FOR UPDATE
TO authenticated
USING (
  constructor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid() AND rol = 'administrador'
  )
)
WITH CHECK (
  constructor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM perfil
    WHERE id = auth.uid() AND rol = 'administrador'
  )
);
