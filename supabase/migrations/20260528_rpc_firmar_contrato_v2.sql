-- ============================================================
-- Fix: firmar_contrato — además de marcar el contrato como
-- firmado, actualiza actualizado_en y pone el expediente en
-- estado 'contratado'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.firmar_contrato(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id    uuid;
  v_estado        text;
  v_expediente_id uuid;
BEGIN
  SELECT cliente_id, estado, expediente_id
    INTO v_cliente_id, v_estado, v_expediente_id
    FROM public.contrato
   WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;

  IF v_cliente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permisos para firmar este contrato';
  END IF;

  IF v_estado <> 'generado' THEN
    RAISE EXCEPTION 'El contrato no puede firmarse en estado %', v_estado;
  END IF;

  -- Marcar el contrato como firmado
  UPDATE public.contrato
     SET estado        = 'firmado',
         firmado_en    = now(),
         actualizado_en = now()
   WHERE id = p_contrato_id;

  -- Actualizar el expediente a 'contratado'
  UPDATE public.expediente
     SET estado = 'contratado'
   WHERE id = v_expediente_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.firmar_contrato(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.firmar_contrato(uuid) TO authenticated;
