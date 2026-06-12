-- ================================================================
-- iniciar_ejecucion_contrato  (versión CONSTRUCTOR)
-- Marca un contrato como en ejecución (estado → 'en_ejecucion')
-- y registra actualizado_en.
--
-- Lo llama el constructor adjudicado al guardar su primer reporte
-- diario. La autorización es por PROPIEDAD: solo el constructor
-- dueño del contrato puede iniciar su ejecución.
--
-- Idempotente desde la perspectiva del llamador: si el contrato ya
-- está 'en_ejecucion' no hace nada (no lanza error), de modo que
-- guardar reportes posteriores no falle.
-- ================================================================
CREATE OR REPLACE FUNCTION public.iniciar_ejecucion_contrato(
  p_contrato_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_constructor_id uuid;
  v_estado         text;
BEGIN
  -- 1. Obtener estado y dueño del contrato
  SELECT estado, constructor_id
    INTO v_estado, v_constructor_id
  FROM public.contrato
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.';
  END IF;

  -- 2. Verificar que el llamante es el constructor adjudicado
  IF v_constructor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: solo el constructor del contrato puede iniciar su ejecución.';
  END IF;

  -- 3. Ya en ejecución (o más avanzado): nada que hacer
  IF v_estado = 'en_ejecucion' THEN
    RETURN;
  END IF;

  -- 4. Solo se transiciona desde 'firmado'
  IF v_estado <> 'firmado' THEN
    RAISE EXCEPTION 'Solo se puede iniciar ejecución de un contrato en estado ''firmado'' (estado actual: %).', v_estado;
  END IF;

  -- 5. Marcar el contrato como en ejecución
  UPDATE public.contrato
  SET estado         = 'en_ejecucion',
      actualizado_en = now()
  WHERE id = p_contrato_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.iniciar_ejecucion_contrato(uuid) TO authenticated;
