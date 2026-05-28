-- ================================================================
-- iniciar_ejecucion_contrato_admin
-- Marca un contrato como en ejecución (estado → 'en_ejecucion')
-- y registra actualizado_en.
-- Solo lo puede llamar el rol 'administrador'.
-- ================================================================
CREATE OR REPLACE FUNCTION public.iniciar_ejecucion_contrato_admin(
  p_contrato_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol    text;
  v_estado text;
BEGIN
  -- 1. Verificar que el llamante es administrador
  SELECT rol INTO v_rol
  FROM public.perfil
  WHERE id = auth.uid();

  IF v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol administrador.';
  END IF;

  -- 2. Obtener estado actual del contrato
  SELECT estado
    INTO v_estado
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  IF v_estado <> 'firmado' THEN
    RAISE EXCEPTION 'Solo se puede iniciar ejecución de un contrato en estado ''firmado'' (estado actual: %).', v_estado;
  END IF;

  -- 3. Marcar el contrato como en ejecución
  UPDATE public.contrato
  SET estado         = 'en_ejecucion',
      actualizado_en = now()
  WHERE id = p_contrato_id;
END;
$$;
