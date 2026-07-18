-- ============================================================
-- Invitación de constructores a expedientes
--
-- 1. Tabla expediente_invitacion: registra qué constructores
--    fueron invitados (por correo) a ofertar en un expediente.
-- 2. RLS: el constructor solo ve / oferta en expedientes a los
--    que fue invitado. Se reescriben las políticas consolidadas
--    VIVAS (expediente_select, expediente_update,
--    localizacion_select, archivo_select, oferta_insert), que
--    usan mi_rol() (SECURITY DEFINER), añadiendo el requisito
--    de invitación SOLO en la rama del constructor. El resto de
--    ramas (cliente, estimador, administrador) queda intacto.
-- 3. Backfill: los constructores con ofertas existentes quedan
--    invitados a esos expedientes para no perder visibilidad.
--
-- La inserción de invitaciones la hace la edge function
-- `enviar-invitacion` con service role (bypasa RLS); las
-- políticas de admin existen como vía directa adicional.
-- ============================================================


-- ── 1. Tabla ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expediente_invitacion (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id  uuid        NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,
  constructor_id uuid        NOT NULL REFERENCES perfil(id)     ON DELETE CASCADE,
  invitado_por   uuid                 REFERENCES perfil(id),
  enviado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expediente_id, constructor_id)
);

CREATE INDEX IF NOT EXISTS idx_expediente_invitacion_constructor
  ON expediente_invitacion (constructor_id);

ALTER TABLE expediente_invitacion ENABLE ROW LEVEL SECURITY;

-- Admin ve todas; el constructor solo las suyas
DROP POLICY IF EXISTS "inv_select" ON expediente_invitacion;
CREATE POLICY "inv_select"
ON expediente_invitacion FOR SELECT TO authenticated
USING (
  constructor_id = auth.uid()
  OR mi_rol() = 'administrador'
);

-- Solo admin inserta / elimina desde el cliente
DROP POLICY IF EXISTS "inv_insert_admin" ON expediente_invitacion;
CREATE POLICY "inv_insert_admin"
ON expediente_invitacion FOR INSERT TO authenticated
WITH CHECK (mi_rol() = 'administrador');

DROP POLICY IF EXISTS "inv_delete_admin" ON expediente_invitacion;
CREATE POLICY "inv_delete_admin"
ON expediente_invitacion FOR DELETE TO authenticated
USING (mi_rol() = 'administrador');


-- ── 2. Políticas existentes: exigir invitación al constructor ─

-- expediente: SELECT
DROP POLICY IF EXISTS "expediente_select" ON expediente;
CREATE POLICY "expediente_select"
ON expediente FOR SELECT TO authenticated
USING (
  cliente_id = auth.uid()
  OR mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado IN ('estimado', 'en_oferta', 'adjudicado', 'contratado')
    AND EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = expediente.id
        AND i.constructor_id = auth.uid()
    )
  )
);

-- expediente: UPDATE (constructor pasa a 'en_oferta' al ofertar)
DROP POLICY IF EXISTS "expediente_update" ON expediente;
CREATE POLICY "expediente_update"
ON expediente FOR UPDATE TO authenticated
USING (
  mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado IN ('estimado', 'en_oferta')
    AND EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = expediente.id
        AND i.constructor_id = auth.uid()
    )
  )
)
WITH CHECK (
  mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado = 'en_oferta'
    AND EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = expediente.id
        AND i.constructor_id = auth.uid()
    )
  )
);

-- localizacion: SELECT
DROP POLICY IF EXISTS "localizacion_select" ON localizacion;
CREATE POLICY "localizacion_select"
ON localizacion FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = localizacion.expediente_id
      AND (
        e.cliente_id = auth.uid()
        OR mi_rol() IN ('estimador', 'administrador')
        OR (
          mi_rol() = 'constructor'
          AND e.estado IN ('estimado', 'en_oferta', 'adjudicado', 'contratado')
          AND EXISTS (
            SELECT 1 FROM expediente_invitacion i
            WHERE i.expediente_id = e.id
              AND i.constructor_id = auth.uid()
          )
        )
      )
  )
);

-- archivo: SELECT (solo cambia la rama constructor-vía-expediente)
DROP POLICY IF EXISTS "archivo_select" ON archivo;
CREATE POLICY "archivo_select"
ON archivo FOR SELECT TO authenticated
USING (
  subido_por = auth.uid()
  OR mi_rol() IN ('estimador', 'administrador')
  OR (
    expediente_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM expediente e
      WHERE e.id = archivo.expediente_id
        AND (
          e.cliente_id = auth.uid()
          OR (
            mi_rol() = 'constructor'
            AND e.estado IN ('estimado', 'en_oferta')
            AND EXISTS (
              SELECT 1 FROM expediente_invitacion i
              WHERE i.expediente_id = e.id
                AND i.constructor_id = auth.uid()
            )
          )
        )
    )
  )
  OR (
    oferta_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM oferta o
      WHERE o.id = archivo.oferta_id
        AND (
          o.constructor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM expediente e
            WHERE e.id = o.expediente_id
              AND e.cliente_id = auth.uid()
          )
        )
    )
  )
  OR (
    reporte_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM reporte_diario r
      JOIN seguimiento_obra s ON s.id = r.seguimiento_id
      JOIN expediente e       ON e.id = s.expediente_id
      WHERE r.id = archivo.reporte_id
        AND e.cliente_id = auth.uid()
    )
  )
);

-- oferta: INSERT (el constructor solo oferta si fue invitado)
DROP POLICY IF EXISTS "oferta_insert" ON oferta;
CREATE POLICY "oferta_insert"
ON oferta FOR INSERT TO authenticated
WITH CHECK (
  mi_rol() = 'administrador'
  OR (
    mi_rol() = 'constructor'
    AND constructor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = oferta.expediente_id
        AND i.constructor_id = auth.uid()
    )
  )
);


-- ── 3. Backfill: ofertas existentes implican invitación ───────

INSERT INTO expediente_invitacion (expediente_id, constructor_id)
SELECT DISTINCT o.expediente_id, o.constructor_id
FROM oferta o
ON CONFLICT (expediente_id, constructor_id) DO NOTHING;
