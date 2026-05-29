-- ============================================================
-- RPC: rechazar_oferta
-- El cliente rechaza la oferta actualmente aceptada:
--   • oferta → 'rechazada'
--   • expediente → 'estimado'
--   • contrato asociado → eliminado físicamente de la tabla
-- El archivo PDF en storage lo elimina la aplicación cliente
-- una vez que obtiene la ruta antes de llamar a este RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rechazar_oferta(
  p_expediente_id uuid,
  p_oferta_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  -- Verificar que el expediente pertenece al cliente (o es admin/estimador)
  IF NOT EXISTS (
    SELECT 1 FROM public.expediente
    WHERE id = p_expediente_id
      AND (
        cliente_id = auth.uid()
        OR v_rol IN ('administrador', 'estimador')
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado: el expediente no existe o no le pertenece.';
  END IF;

  -- Verificar que la oferta pertenece al expediente y está aceptada
  IF NOT EXISTS (
    SELECT 1 FROM public.oferta
    WHERE id = p_oferta_id
      AND expediente_id = p_expediente_id
      AND estado = 'aceptada'
  ) THEN
    RAISE EXCEPTION 'La oferta no está en estado aceptada o no pertenece a este expediente.';
  END IF;

  -- Marcar la oferta como rechazada
  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE id = p_oferta_id;

  -- Cambiar el expediente a 'estimado'
  UPDATE public.expediente
  SET estado = 'estimado'
  WHERE id = p_expediente_id;

  -- Eliminar el contrato vinculado a esta oferta
  DELETE FROM public.contrato
  WHERE oferta_id = p_oferta_id;
END;
$$;
