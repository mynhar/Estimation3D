-- ================================================================
-- firmar_contrato_admin
-- Marca un contrato como firmado (estado → 'firmado'),
-- registra firmado_en y actualizado_en, y avanza el expediente
-- a estado 'contratado'.
-- Solo lo puede llamar el rol 'administrador'.
-- ================================================================
CREATE OR REPLACE FUNCTION public.firmar_contrato_admin(
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
  v_estado        text;
BEGIN
  -- 1. Verificar que el llamante es administrador
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  IF v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  -- 2. Obtener expediente_id y estado actual del contrato
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

  -- 3. Marcar el contrato como firmado
  UPDATE public.contrato
  SET estado         = 'firmado',
      firmado_en     = now(),
      actualizado_en = now()
  WHERE id = p_contrato_id;

  -- 4. Avanzar el expediente a 'contratado'
  UPDATE public.expediente
  SET estado = 'contratado'
  WHERE id = v_expediente_id;
END;
$$;
