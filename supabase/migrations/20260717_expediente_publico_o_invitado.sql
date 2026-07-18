-- ============================================================
-- Expedientes públicos vs. exclusivos por invitación
--
-- Ajuste sobre 20260717_invitacion_constructores: un expediente
-- SIN invitaciones por correo sigue siendo público para todos
-- los constructores (con el límite de 5 ofertas ya existente).
-- Solo los expedientes que fueron enviados como invitación por
-- correo (existe fila con invitado_por NOT NULL) quedan
-- exclusivos: los ven y ofertan únicamente los invitados.
--
-- La comprobación "¿tiene invitaciones de correo?" debe ver TODAS
-- las filas de expediente_invitacion, pero el constructor solo
-- puede leer las suyas por RLS → función SECURITY DEFINER
-- (mismo patrón que mi_rol()).
-- ============================================================


-- ── 1. Función de visibilidad ────────────────────────────────

CREATE OR REPLACE FUNCTION constructor_puede_ver_expediente(exp uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Público: nadie ha sido invitado por correo a este expediente
    NOT EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = exp
        AND i.invitado_por IS NOT NULL
    )
    -- Exclusivo: el constructor actual está entre los invitados
    OR EXISTS (
      SELECT 1 FROM expediente_invitacion i
      WHERE i.expediente_id = exp
        AND i.constructor_id = auth.uid()
    )
    -- Salvaguarda: quien ya ofertó no pierde acceso si el expediente
    -- se vuelve exclusivo después (invitación por correo a terceros)
    OR EXISTS (
      SELECT 1 FROM oferta o
      WHERE o.expediente_id = exp
        AND o.constructor_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION constructor_puede_ver_expediente(uuid) FROM public;
GRANT EXECUTE ON FUNCTION constructor_puede_ver_expediente(uuid) TO authenticated;


-- ── 2. Políticas: público-o-invitado en la rama constructor ──

DROP POLICY IF EXISTS "expediente_select" ON expediente;
CREATE POLICY "expediente_select"
ON expediente FOR SELECT TO authenticated
USING (
  cliente_id = auth.uid()
  OR mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado IN ('estimado', 'en_oferta', 'adjudicado', 'contratado')
    AND constructor_puede_ver_expediente(expediente.id)
  )
);

DROP POLICY IF EXISTS "expediente_update" ON expediente;
CREATE POLICY "expediente_update"
ON expediente FOR UPDATE TO authenticated
USING (
  mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado IN ('estimado', 'en_oferta')
    AND constructor_puede_ver_expediente(expediente.id)
  )
)
WITH CHECK (
  mi_rol() IN ('estimador', 'administrador')
  OR (
    mi_rol() = 'constructor'
    AND estado = 'en_oferta'
    AND constructor_puede_ver_expediente(expediente.id)
  )
);

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
          AND constructor_puede_ver_expediente(e.id)
        )
      )
  )
);

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
            AND constructor_puede_ver_expediente(e.id)
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

DROP POLICY IF EXISTS "oferta_insert" ON oferta;
CREATE POLICY "oferta_insert"
ON oferta FOR INSERT TO authenticated
WITH CHECK (
  mi_rol() = 'administrador'
  OR (
    mi_rol() = 'constructor'
    AND constructor_id = auth.uid()
    AND constructor_puede_ver_expediente(oferta.expediente_id)
  )
);
