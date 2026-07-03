-- ============================================================================
-- Purga de un usuario y de todos sus registros relacionados (BASE DE DATOS)
-- Proyecto: Estimation3D (ckdksfvxjimxuqceoeyr)
--
-- >>> Ejecuta ANTES el script de storage: 01-borrar-storage.mjs <<<
--     (este SQL borra la metadata; los ficheros físicos se borran con la API)
--
-- OPERACIÓN IRREVERSIBLE. Recomendado: crear un backup / restore point antes.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CÓMO USARLO (reutilizable para CUALQUIER usuario):                    │
-- │  1. Edita SOLO la línea set_config de abajo con el email objetivo.     │
-- │  2. Para previsualizar: selecciona [esa línea + SECCIÓN 0] y ejecútalo.│
-- │  3. Para borrar:        selecciona [esa línea + SECCIÓN 1] y ejecútalo.│
-- │     (incluye SIEMPRE la línea set_config en la selección que ejecutes) │
-- └──────────────────────────────────────────────────────────────────────┘
--
-- NOTA sobre el ROL del usuario:
--   Esta purga elimina los datos de los que el usuario es DUEÑO: sus
--   expedientes (como cliente) y todo lo que cuelga de ellos, los archivos que
--   subió y las inspecciones que creó. Está pensada para usuarios CLIENTE.
--   Si el usuario es estimador/constructor, sus asignaciones en expedientes de
--   OTROS clientes (estimador_id, constructor_id, etc.) NO se borran a propósito
--   —esos datos pertenecen a otros clientes—. En ese caso el bloque opcional de
--   borrar la cuenta fallará (referencias NO ACTION): revísalo con la SECCIÓN 0.
-- ============================================================================

-- ██████ CONFIGURACIÓN — edita estas dos líneas ██████
SELECT set_config('app.target_email',  'hmbonilla@gmail.com', false); -- email a purgar
SELECT set_config('app.borrar_cuenta', 'true',                false); -- 'true' = borra también la cuenta (perfil + login); 'false' = solo datos


-- ----------------------------------------------------------------------------
-- SECCIÓN 0 · PREVISUALIZACIÓN (NO borra nada)
--   Selecciona la línea set_config de arriba + esta sección y ejecútalas juntas.
-- ----------------------------------------------------------------------------
WITH u AS (
  SELECT id FROM perfil WHERE lower(email) = lower(current_setting('app.target_email'))
)
SELECT 'usuario encontrado'                        AS entidad, count(*)::text AS valor FROM u
UNION ALL SELECT 'rol del usuario',                 coalesce(max(rol::text),'(no existe)') FROM perfil WHERE id = (SELECT id FROM u)
UNION ALL SELECT '— DATOS QUE SE BORRAN (es dueño) —', ''
UNION ALL SELECT 'expedientes (cliente)',           count(*)::text FROM expediente WHERE cliente_id = (SELECT id FROM u)
UNION ALL SELECT 'contratos (cliente)',             count(*)::text FROM contrato   WHERE cliente_id = (SELECT id FROM u)
UNION ALL SELECT 'estimaciones (de sus exp.)',      count(*)::text FROM estimacion WHERE expediente_id IN (SELECT id FROM expediente WHERE cliente_id = (SELECT id FROM u))
UNION ALL SELECT 'ofertas (de sus exp.)',           count(*)::text FROM oferta     WHERE expediente_id IN (SELECT id FROM expediente WHERE cliente_id = (SELECT id FROM u))
UNION ALL SELECT 'seguimientos (de sus exp.)',      count(*)::text FROM seguimiento_obra WHERE expediente_id IN (SELECT id FROM expediente WHERE cliente_id = (SELECT id FROM u))
UNION ALL SELECT 'archivo: de sus expedientes',     count(*)::text FROM archivo    WHERE expediente_id IN (SELECT id FROM expediente WHERE cliente_id = (SELECT id FROM u))
UNION ALL SELECT 'archivo: subidos por el usuario', count(*)::text FROM archivo    WHERE subido_por = (SELECT id FROM u)
UNION ALL SELECT 'inspecciones creadas por él',     count(*)::text FROM inspeccion WHERE creado_por = (SELECT id FROM u)
UNION ALL SELECT 'archivo SIN contexto (huérfanos)',count(*)::text FROM archivo
          WHERE expediente_id IS NULL AND estimacion_id IS NULL AND oferta_id IS NULL AND reporte_id IS NULL
UNION ALL SELECT '— ASIGNACIONES EN DATOS DE OTROS (NO se borran) —', ''
UNION ALL SELECT 'expedientes donde es estimador',  count(*)::text FROM expediente WHERE estimador_id  = (SELECT id FROM u)
UNION ALL SELECT 'estimaciones como estimador',     count(*)::text FROM estimacion WHERE estimador_id  = (SELECT id FROM u)
UNION ALL SELECT 'ofertas como constructor',        count(*)::text FROM oferta     WHERE constructor_id = (SELECT id FROM u)
UNION ALL SELECT 'contratos como constructor',      count(*)::text FROM contrato   WHERE constructor_id = (SELECT id FROM u);


-- ----------------------------------------------------------------------------
-- SECCIÓN 1 · BORRADO (transaccional)
--   Selecciona la línea set_config de arriba + esta sección y ejecútalas juntas.
-- ----------------------------------------------------------------------------
BEGIN;

-- Resolver el usuario objetivo (aborta si no existe o es ambiguo)
CREATE TEMPORARY TABLE _tgt ON COMMIT DROP AS
SELECT id AS uid FROM perfil WHERE lower(email) = lower(current_setting('app.target_email'));

DO $$
BEGIN
  IF (SELECT count(*) FROM _tgt) <> 1 THEN
    RAISE EXCEPTION 'Usuario no encontrado o ambiguo para "%". Abortando.',
      current_setting('app.target_email');
  END IF;
END $$;

-- 1) Contratos del usuario (como cliente).
--    Cascada -> seguimiento_obra -> reporte_diario -> reporte_actividad,
--    reporte_zona, archivo(reporte_id) e inspeccion.
DELETE FROM contrato WHERE cliente_id IN (SELECT uid FROM _tgt);

-- 2) Expedientes del usuario (como cliente).
--    Cascada -> localizacion, estimacion, oferta, seguimiento_obra,
--    archivo(expediente_id / estimacion_id / oferta_id).
DELETE FROM expediente WHERE cliente_id IN (SELECT uid FROM _tgt);

-- 3) Archivos subidos por el usuario en cualquier otro contexto (si quedan).
DELETE FROM archivo WHERE subido_por IN (SELECT uid FROM _tgt);

-- 4) Inspecciones creadas por el usuario que no hayan caído por cascada.
DELETE FROM inspeccion WHERE creado_por IN (SELECT uid FROM _tgt);

-- 5) Archivos SIN contexto (huérfanos de la tabla: todas las FK en NULL).
DELETE FROM archivo
WHERE expediente_id IS NULL AND estimacion_id IS NULL
  AND oferta_id IS NULL AND reporte_id IS NULL;

-- 6) Cuenta del usuario (perfil + login de auth), SOLO si app.borrar_cuenta='true'.
--    Falla a propósito si el usuario aún tiene asignaciones en datos de otros
--    (estimador/constructor) por las FK NO ACTION: en ese caso NO se debe borrar
--    la cuenta sin reasignar antes esos registros.
DELETE FROM perfil
WHERE id IN (SELECT uid FROM _tgt)
  AND coalesce(current_setting('app.borrar_cuenta', true), 'false') = 'true';

DELETE FROM auth.users
WHERE id IN (SELECT uid FROM _tgt)
  AND coalesce(current_setting('app.borrar_cuenta', true), 'false') = 'true';

-- Revisa que no haya errores y confirma:
COMMIT;
-- ROLLBACK;   -- usa esto EN LUGAR de COMMIT para abortar sin cambios
