-- ============================================================
-- FIX: aceptar_oferta — la eliminación previa también debe
-- cubrir contratos en estado 'cancelado', para evitar la
-- violación de la restricción única contrato_oferta_id_key
-- cuando el cliente re-adjudica una oferta previamente cancelada.
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
  v_estado          text;
  v_rol             text;
  v_cliente_id      uuid;
  v_constructor_id  uuid;
  v_precio          numeric;
  v_garantia_anos   integer;
  v_descripcion     text;
BEGIN
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  SELECT estado, cliente_id INTO v_estado, v_cliente_id
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

  SELECT constructor_id, precio, garantia_anos, descripcion
  INTO v_constructor_id, v_precio, v_garantia_anos, v_descripcion
  FROM public.oferta
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La oferta seleccionada no pertenece a este expediente.';
  END IF;

  UPDATE public.expediente
  SET estado = 'adjudicado'
  WHERE id = p_expediente_id;

  UPDATE public.oferta
  SET estado = 'aceptada'
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE expediente_id = p_expediente_id
    AND id <> p_oferta_id;

  -- Eliminar contratos previos del expediente en estados re-adjudicables.
  -- Se incluye 'cancelado' para evitar violación de unique constraint en oferta_id
  -- cuando el cliente cancela y luego vuelve a aceptar la misma oferta.
  DELETE FROM public.contrato
  WHERE expediente_id = p_expediente_id
    AND estado IN ('generado', 'cancelado');

  INSERT INTO public.contrato (
    expediente_id,
    oferta_id,
    cliente_id,
    constructor_id,
    precio_final,
    garantia_anos,
    descripcion_trabajo,
    estado
  ) VALUES (
    p_expediente_id,
    p_oferta_id,
    v_cliente_id,
    v_constructor_id,
    v_precio,
    v_garantia_anos,
    v_descripcion,
    'generado'
  );
END;
$$;
