-- ================================================================
-- cancelar_contrato_admin
-- Cancela un contrato (estado → 'cancelado'):
--   · La oferta vinculada al contrato → 'rechazada'
--   · Las demás ofertas del expediente → 'pendiente'
--   · Expediente → 'en_oferta' si quedan ofertas no rechazadas
--   · Expediente → 'estimado'  si no quedan ofertas no rechazadas
-- Solo lo puede llamar el rol 'administrador'.
-- ================================================================
CREATE OR REPLACE FUNCTION public.cancelar_contrato_admin(
  p_contrato_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol           text;
  v_expediente_id uuid;
  v_oferta_id     uuid;
  v_oferta_count  integer;
BEGIN
  -- 1. Verificar que el llamante es administrador
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  IF v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  -- 2. Obtener expediente_id y oferta_id del contrato
  SELECT expediente_id, oferta_id
    INTO v_expediente_id, v_oferta_id
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  -- 3. Marcar el contrato como cancelado
  UPDATE public.contrato
  SET estado         = 'cancelado',
      actualizado_en = now()
  WHERE id = p_contrato_id;

  -- 4. La oferta vinculada al contrato → 'rechazada'
  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE id = v_oferta_id;

  -- 5. Las demás ofertas del expediente → 'pendiente'
  UPDATE public.oferta
  SET estado = 'pendiente'
  WHERE expediente_id = v_expediente_id
    AND id <> v_oferta_id;

  -- 6. Contar ofertas no rechazadas para decidir estado del expediente
  SELECT COUNT(*) INTO v_oferta_count
  FROM public.oferta
  WHERE expediente_id = v_expediente_id
    AND estado <> 'rechazada';

  IF v_oferta_count > 0 THEN
    UPDATE public.expediente SET estado = 'en_oferta' WHERE id = v_expediente_id;
  ELSE
    UPDATE public.expediente SET estado = 'estimado'  WHERE id = v_expediente_id;
  END IF;
END;
$$;
