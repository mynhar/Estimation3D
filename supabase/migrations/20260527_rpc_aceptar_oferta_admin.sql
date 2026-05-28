-- ============================================================
-- FIX: aceptar_oferta — permitir que administrador y estimador
-- puedan adjudicar ofertas, no solo el cliente propietario.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aceptar_oferta(
  p_expediente_id uuid,
  p_oferta_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_rol    text;
BEGIN
  -- Obtener el rol del usuario actual
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  -- 1. Verificar existencia y estado del expediente.
  --    Cliente: solo los expedientes que le pertenecen.
  --    Administrador / Estimador: cualquier expediente.
  SELECT estado INTO v_estado
  FROM public.expediente
  WHERE id = p_expediente_id
    AND (
      cliente_id = auth.uid()
      OR v_rol IN ('administrador', 'estimador')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: el expediente no existe o no le pertenece.';
  END IF;

  IF v_estado NOT IN ('en_oferta', 'adjudicado') THEN
    RAISE EXCEPTION 'El expediente no está en un estado válido para aceptar ofertas (estado actual: %).', v_estado;
  END IF;

  -- 2. Verificar que la oferta pertenece al expediente indicado
  IF NOT EXISTS (
    SELECT 1 FROM public.oferta
    WHERE id = p_oferta_id
      AND expediente_id = p_expediente_id
  ) THEN
    RAISE EXCEPTION 'La oferta seleccionada no pertenece a este expediente.';
  END IF;

  -- 3. Actualizar expediente → adjudicado
  UPDATE public.expediente
  SET estado = 'adjudicado'
  WHERE id = p_expediente_id;

  -- 4. Marcar la oferta elegida → aceptada
  UPDATE public.oferta
  SET estado = 'aceptada'
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  -- 5. Rechazar las demás ofertas del mismo expediente
  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE expediente_id = p_expediente_id
    AND id <> p_oferta_id;
END;
$$;
