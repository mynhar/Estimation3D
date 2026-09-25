-- ============================================================================
-- `cancelar_contrato_admin` y `firmar_contrato_admin` dejan de tocar el resto
-- del expediente
--
-- Las dos eran «por contrato» sólo de nombre. Con un contrato por expediente
-- daba igual; desde que administración adjudica a varios constructores —un
-- contrato por oferta— cada una descuadraba a los demás:
--
--   · cancelar_contrato_admin ponía TODAS las demás ofertas en 'pendiente',
--     dejando ofertas «pendientes» con su contrato aún 'generado'. Además
--     bajaba el expediente a 'en_oferta' habiendo contratos vivos.
--
--   · firmar_contrato_admin pasaba el expediente a 'contratado' al firmar UNO,
--     con los demás todavía sin firmar. Eso bloquea el reparto y la
--     re-adjudicación del resto antes de tiempo.
--
-- A partir de aquí cada una toca su contrato y nada más. El estado del
-- expediente se deriva del conjunto, no del contrato que se acaba de tocar:
--
--   · cancelar → si quedan contratos activos, el expediente no se mueve.
--     Si no queda ninguno, vuelve a 'en_oferta' (o 'estimado' si tampoco
--     quedan ofertas vivas sin rechazar).
--   · firmar   → 'contratado' sólo cuando ya no queda ningún contrato
--     pendiente de firma. Mientras haya alguno en 'generado', sigue
--     'adjudicado'.
--
-- De paso se corrige la guarda de rol: `v_rol <> 'administrador'` con v_rol
-- NULL evalúa a NULL, y un `IF NULL THEN` no entra — quien no tiene fila en
-- `perfil` se saltaba la comprobación entera.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_contrato_admin(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_expediente_id uuid;
  v_oferta_id     uuid;
  v_oferta        public.oferta%ROWTYPE;
  v_activos       integer;
  v_vivas         integer;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  SELECT expediente_id, oferta_id
    INTO v_expediente_id, v_oferta_id
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  UPDATE public.contrato
  SET estado         = 'cancelado',
      actualizado_en = now()
  WHERE id = p_contrato_id;

  -- Sólo la oferta de ESTE contrato. Las demás conservan su estado: cada una
  -- tiene su propio contrato y su propia vida.
  SELECT * INTO v_oferta FROM public.oferta WHERE id = v_oferta_id;

  IF FOUND AND v_oferta.estado <> 'rechazada' THEN
    INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
    VALUES (v_oferta_id, v_expediente_id, 'rechazada', auth.uid(), to_jsonb(v_oferta));

    UPDATE public.oferta SET estado = 'rechazada' WHERE id = v_oferta_id;
  END IF;

  -- El expediente sólo retrocede si ya no queda ningún contrato en pie.
  SELECT COUNT(*) INTO v_activos
  FROM public.contrato
  WHERE expediente_id = v_expediente_id
    AND estado IN ('generado', 'firmado', 'en_ejecucion');

  IF v_activos = 0 THEN
    SELECT COUNT(*) INTO v_vivas
    FROM public.oferta
    WHERE expediente_id = v_expediente_id
      AND eliminada_en IS NULL
      AND estado <> 'rechazada';

    UPDATE public.expediente
    SET estado = CASE WHEN v_vivas > 0 THEN 'en_oferta' ELSE 'estimado' END::estado_expediente
    WHERE id = v_expediente_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.firmar_contrato_admin(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_expediente_id uuid;
  v_estado        text;
  v_pendientes    integer;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  SELECT expediente_id, estado
    INTO v_expediente_id, v_estado
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  IF v_estado <> 'generado' THEN
    RAISE EXCEPTION 'Solo se puede firmar un contrato en estado ''generado'' (estado actual: %).', v_estado;
  END IF;

  -- Sólo este contrato. El disparador fn_contrato_crea_seguimiento se encarga
  -- de crear su seguimiento de obra.
  UPDATE public.contrato
  SET estado         = 'firmado',
      firmado_en     = now(),
      actualizado_en = now()
  WHERE id = p_contrato_id;

  -- 'contratado' describe al expediente entero, así que sólo se aplica cuando
  -- ya no queda ninguna firma pendiente. Con contratos aún en 'generado' el
  -- expediente sigue 'adjudicado' y los demás se pueden firmar.
  SELECT COUNT(*) INTO v_pendientes
  FROM public.contrato
  WHERE expediente_id = v_expediente_id
    AND estado = 'generado';

  IF v_pendientes = 0 THEN
    UPDATE public.expediente SET estado = 'contratado' WHERE id = v_expediente_id;
  END IF;
END;
$$;
