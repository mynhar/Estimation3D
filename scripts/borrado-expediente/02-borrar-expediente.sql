-- ============================================================================
-- Purga de un EXPEDIENTE y de todos sus registros relacionados (BASE DE DATOS)
-- Proyecto: Estimation3D (ckdksfvxjimxuqceoeyr)
--
-- >>> Ejecuta ANTES el script de storage: 01-borrar-storage.mjs <<<
--     (este SQL borra la metadata; los ficheros físicos se borran con la API)
--
-- OPERACIÓN IRREVERSIBLE. Recomendado: crear un backup / restore point antes.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CÓMO USARLO (reutilizable para CUALQUIER expediente):                 │
-- │  1. Edita SOLO la línea set_config de abajo con el número de exp.      │
-- │  2. Para previsualizar: selecciona [esa línea + SECCIÓN 0] y ejecútalo.│
-- │  3. Para borrar:        selecciona [esa línea + SECCIÓN 1] y ejecútalo.│
-- │     (incluye SIEMPRE la línea set_config en la selección que ejecutes) │
-- └──────────────────────────────────────────────────────────────────────┘
--
-- Cascadas (no hace falta borrarlas a mano):
--   expediente -> localizacion, estimacion, oferta, seguimiento_obra,
--                 archivo(expediente_id / estimacion_id / oferta_id)
--   contrato   -> seguimiento_obra -> reporte_diario -> reporte_actividad,
--                 reporte_zona, archivo(reporte_id), inspeccion
-- FK NO ACTION que obligan el orden: contrato->expediente y contrato->oferta
--   => por eso se borra el CONTRATO antes que el EXPEDIENTE.
-- ============================================================================

-- ██████ EDITA SOLO ESTA LÍNEA: número de expediente a purgar ██████
SELECT set_config('app.exp_numero', 'EXP-20260518-1543', false);


-- ----------------------------------------------------------------------------
-- SECCIÓN 0 · PREVISUALIZACIÓN (NO borra nada)
-- ----------------------------------------------------------------------------
WITH e AS (SELECT id FROM expediente WHERE numero = current_setting('app.exp_numero'))
SELECT 'expediente encontrado'  AS entidad, count(*)::text AS valor FROM e
UNION ALL SELECT 'estado',        coalesce((SELECT estado::text FROM expediente WHERE id=(SELECT id FROM e)), '(no existe)')
UNION ALL SELECT 'localizacion',  count(*)::text FROM localizacion    WHERE expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'estimaciones',  count(*)::text FROM estimacion       WHERE expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'ofertas',       count(*)::text FROM oferta           WHERE expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'contratos',     count(*)::text FROM contrato         WHERE expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'seguimientos',  count(*)::text FROM seguimiento_obra WHERE expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'reportes',      count(*)::text FROM reporte_diario r JOIN seguimiento_obra s ON s.id=r.seguimiento_id WHERE s.expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'inspecciones',  count(*)::text FROM inspeccion i     JOIN seguimiento_obra s ON s.id=i.seguimiento_id WHERE s.expediente_id=(SELECT id FROM e)
UNION ALL SELECT 'archivos (tabla, todos los contextos)', count(*)::text FROM archivo a WHERE
      a.expediente_id = (SELECT id FROM e)
   OR a.estimacion_id IN (SELECT id FROM estimacion WHERE expediente_id=(SELECT id FROM e))
   OR a.oferta_id     IN (SELECT id FROM oferta     WHERE expediente_id=(SELECT id FROM e))
   OR a.reporte_id    IN (SELECT r.id FROM reporte_diario r JOIN seguimiento_obra s ON s.id=r.seguimiento_id WHERE s.expediente_id=(SELECT id FROM e));


-- ----------------------------------------------------------------------------
-- SECCIÓN 1 · BORRADO (transaccional)
-- ----------------------------------------------------------------------------
BEGIN;

CREATE TEMPORARY TABLE _exp ON COMMIT DROP AS
SELECT id FROM expediente WHERE numero = current_setting('app.exp_numero');

DO $$
BEGIN
  IF (SELECT count(*) FROM _exp) <> 1 THEN
    RAISE EXCEPTION 'Expediente "%" no encontrado o ambiguo. Abortando.',
      current_setting('app.exp_numero');
  END IF;
END $$;

-- 1) Contrato(s) del expediente (FK NO ACTION → van primero).
--    Cascada -> seguimiento_obra -> reporte_diario -> reporte_actividad,
--    reporte_zona, archivo(reporte_id) e inspeccion.
DELETE FROM contrato WHERE expediente_id IN (SELECT id FROM _exp);

-- 2) Expediente. Cascada -> localizacion, estimacion, oferta, seguimiento_obra,
--    archivo(expediente_id / estimacion_id / oferta_id).
DELETE FROM expediente WHERE id IN (SELECT id FROM _exp);

-- Revisa que no haya errores y confirma:
COMMIT;
-- ROLLBACK;   -- usa esto EN LUGAR de COMMIT para abortar sin cambios
