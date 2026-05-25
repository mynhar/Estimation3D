-- RPC: firmar_contrato
-- Solo el cliente dueño del contrato puede firmarlo, y solo cuando estado = 'generado'.
-- SECURITY DEFINER para evitar que el RLS impida el UPDATE.

CREATE OR REPLACE FUNCTION firmar_contrato(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_estado     text;
BEGIN
  SELECT cliente_id, estado
    INTO v_cliente_id, v_estado
    FROM contrato
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

  UPDATE contrato
     SET estado     = 'firmado',
         firmado_en = now()
   WHERE id = p_contrato_id;
END;
$$;

-- Solo usuarios autenticados pueden ejecutar esta función
REVOKE EXECUTE ON FUNCTION firmar_contrato(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION firmar_contrato(uuid) TO authenticated;
