-- ============================================================================
-- Selección múltiple de ofertas en administración
--
-- Hasta ahora el único cambio de estado en bloque lo hacía `aceptar_oferta`:
-- adjudicaba UNA oferta, rechazaba el resto y generaba contrato + seguimiento
-- de obra. Eso sirve para la adjudicación final, pero no para el paso previo:
-- el administrador necesita poder aceptar varias ofertas a la vez y rechazar
-- las demás SIN comprometer un contrato todavía.
--
-- Tres operaciones nuevas, todas sobre un conjunto de ofertas y todas atómicas:
--
--   · aceptar_seleccion_ofertas → las del conjunto pasan a 'aceptada';
--     TODAS las demás vivas del expediente pasan a 'rechazada'.
--   · rechazar_ofertas          → las del conjunto pasan a 'rechazada';
--     el resto no se toca.
--   · reactivar_ofertas         → devuelve 'rechazada' a 'pendiente'.
--
-- Ninguna genera contrato ni cambia el estado del expediente. El contrato lo
-- sigue creando `aceptar_oferta` (el botón del trofeo) sobre UNA de las
-- aceptadas, y es ahí donde el expediente pasa a 'adjudicado'.
--
-- Por eso las tres se niegan a actuar si el expediente ya está 'adjudicado' o
-- 'contratado': con un contrato vivo, reescribir el estado de las ofertas lo
-- dejaría descuadrado. Para rehacer el reparto hay que cancelar antes.
--
-- Todo queda en `oferta_auditoria`, una fila por oferta y con el estado previo.
-- Idempotente.
-- ============================================================================

-- ── 1. La bitácora admite las acciones nuevas ───────────────────────────────

ALTER TABLE public.oferta_auditoria
  DROP CONSTRAINT IF EXISTS oferta_auditoria_accion_check;

ALTER TABLE public.oferta_auditoria
  ADD CONSTRAINT oferta_auditoria_accion_check
  CHECK (accion IN ('eliminada', 'restaurada', 'aceptada', 'rechazada', 'reactivada'));

-- ── 2. Guarda común ─────────────────────────────────────────────────────────
-- Rol + expediente sin contrato vivo. Lanza si no se cumple.
-- `v_rol IS NULL OR ...` y no sólo `NOT IN`: con v_rol NULL la comparación es
-- NULL, y un `IF NULL THEN` no entra — quien no tiene fila en `perfil` se
-- saltaría la comprobación entera.

CREATE OR REPLACE FUNCTION public.fn_guarda_reparto_ofertas(p_expediente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol    text;
  v_estado text;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('administrador', 'estimador') THEN
    RAISE EXCEPTION 'No autorizado para cambiar el estado de las ofertas.';
  END IF;

  SELECT estado INTO v_estado FROM public.expediente WHERE id = p_expediente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El expediente no existe.';
  END IF;

  IF v_estado IN ('adjudicado', 'contratado') THEN
    RAISE EXCEPTION 'El expediente ya tiene contrato (estado: %). Cancela el contrato antes de rehacer el reparto de ofertas.', v_estado;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guarda_reparto_ofertas(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_guarda_reparto_ofertas(uuid) FROM anon;

-- ── 3. Aceptar la selección; el resto, rechazado ────────────────────────────

CREATE OR REPLACE FUNCTION public.aceptar_seleccion_ofertas(
  p_expediente_id uuid,
  p_ofertas       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cambios integer := 0;
BEGIN
  PERFORM public.fn_guarda_reparto_ofertas(p_expediente_id);

  IF array_length(p_ofertas, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos una oferta.';
  END IF;

  -- Toda la selección tiene que ser del expediente y estar viva. Si no, se
  -- aborta entera: un reparto a medias es peor que ninguno.
  IF EXISTS (
    SELECT 1 FROM unnest(p_ofertas) AS s(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.oferta o
      WHERE o.id = s.id
        AND o.expediente_id = p_expediente_id
        AND o.eliminada_en IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Alguna oferta de la selección no pertenece a este expediente o está eliminada.';
  END IF;

  -- Bitácora antes de tocar nada: el snapshot tiene que ser el estado previo.
  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  SELECT o.id, p_expediente_id,
         CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END,
         auth.uid(), to_jsonb(o)
  FROM public.oferta o
  WHERE o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado IS DISTINCT FROM (
      CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END
    )::estado_oferta;

  UPDATE public.oferta o
  SET estado = CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END::estado_oferta
  WHERE o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado IS DISTINCT FROM (
      CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END
    )::estado_oferta;

  GET DIAGNOSTICS v_cambios = ROW_COUNT;
  RETURN v_cambios;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aceptar_seleccion_ofertas(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aceptar_seleccion_ofertas(uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.aceptar_seleccion_ofertas(uuid, uuid[]) TO authenticated;

-- ── 4. Rechazar la selección; el resto no se toca ───────────────────────────

CREATE OR REPLACE FUNCTION public.rechazar_ofertas(
  p_expediente_id uuid,
  p_ofertas       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cambios integer := 0;
BEGIN
  PERFORM public.fn_guarda_reparto_ofertas(p_expediente_id);

  IF array_length(p_ofertas, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos una oferta.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_ofertas) AS s(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.oferta o
      WHERE o.id = s.id
        AND o.expediente_id = p_expediente_id
        AND o.eliminada_en IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Alguna oferta de la selección no pertenece a este expediente o está eliminada.';
  END IF;

  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  SELECT o.id, p_expediente_id, 'rechazada', auth.uid(), to_jsonb(o)
  FROM public.oferta o
  WHERE o.id = ANY(p_ofertas)
    AND o.eliminada_en IS NULL
    AND o.estado <> 'rechazada';

  UPDATE public.oferta o
  SET estado = 'rechazada'
  WHERE o.id = ANY(p_ofertas)
    AND o.eliminada_en IS NULL
    AND o.estado <> 'rechazada';

  GET DIAGNOSTICS v_cambios = ROW_COUNT;
  RETURN v_cambios;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rechazar_ofertas(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rechazar_ofertas(uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rechazar_ofertas(uuid, uuid[]) TO authenticated;

-- ── 5. Reactivar: 'rechazada' vuelve a 'pendiente' ──────────────────────────
-- Un rechazo por error no puede ser una vía sin retorno; es el mismo principio
-- que llevó el borrado de ofertas a baja lógica.

CREATE OR REPLACE FUNCTION public.reactivar_ofertas(
  p_expediente_id uuid,
  p_ofertas       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cambios integer := 0;
BEGIN
  PERFORM public.fn_guarda_reparto_ofertas(p_expediente_id);

  IF array_length(p_ofertas, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos una oferta.';
  END IF;

  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  SELECT o.id, p_expediente_id, 'reactivada', auth.uid(), to_jsonb(o)
  FROM public.oferta o
  WHERE o.id = ANY(p_ofertas)
    AND o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado = 'rechazada';

  UPDATE public.oferta o
  SET estado = 'pendiente'
  WHERE o.id = ANY(p_ofertas)
    AND o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado = 'rechazada';

  GET DIAGNOSTICS v_cambios = ROW_COUNT;

  IF v_cambios = 0 THEN
    RAISE EXCEPTION 'Ninguna de las ofertas indicadas estaba rechazada.';
  END IF;

  RETURN v_cambios;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivar_ofertas(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reactivar_ofertas(uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reactivar_ofertas(uuid, uuid[]) TO authenticated;
