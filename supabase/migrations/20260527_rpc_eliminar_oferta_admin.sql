-- ============================================================
-- RPC: eliminar_oferta_admin
-- Elimina una oferta gestionando la FK con contrato:
--   1. Si la oferta está aceptada → elimina el contrato generado,
--      resetea las demás ofertas a 'pendiente'.
--   2. Elimina la oferta.
--   3. Ajusta el estado del expediente:
--      - Sin ofertas restantes → 'estimado'
--      - Se borró la aceptada  → 'en_oferta'
--      - Se borró una rechazada/pendiente → sin cambio
-- ============================================================

CREATE OR REPLACE FUNCTION public.eliminar_oferta_admin(
  p_oferta_id     uuid,
  p_expediente_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_oferta_estado text;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol NOT IN ('administrador', 'estimador') THEN
    RAISE EXCEPTION 'No autorizado para eliminar ofertas.';
  END IF;

  SELECT estado INTO v_oferta_estado
  FROM public.oferta
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La oferta no existe o no pertenece a este expediente.';
  END IF;

  IF v_oferta_estado = 'aceptada' THEN
    -- Romper la FK: eliminar el contrato generado que referencia esta oferta
    DELETE FROM public.contrato
    WHERE oferta_id = p_oferta_id
      AND estado = 'generado';

    -- Reactivar las demás ofertas del expediente
    UPDATE public.oferta
    SET estado = 'pendiente'
    WHERE expediente_id = p_expediente_id
      AND id <> p_oferta_id;
  END IF;

  DELETE FROM public.oferta WHERE id = p_oferta_id;

  IF NOT EXISTS (SELECT 1 FROM public.oferta WHERE expediente_id = p_expediente_id) THEN
    UPDATE public.expediente
    SET estado = 'estimado'
    WHERE id = p_expediente_id;
  ELSIF v_oferta_estado = 'aceptada' THEN
    UPDATE public.expediente
    SET estado = 'en_oferta'
    WHERE id = p_expediente_id;
  END IF;
END;
$$;
