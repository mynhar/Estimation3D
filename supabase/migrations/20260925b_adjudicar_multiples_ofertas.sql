-- ============================================================================
-- Adjudicación múltiple: un contrato por oferta seleccionada
--
-- `aceptar_oferta` adjudica UNA oferta y crea UN contrato. Administración
-- necesita adjudicar varias a la vez y obtener un contrato (y su PDF) por cada
-- una. `contrato` lo admite: tiene UNIQUE (oferta_id) pero ninguna restricción
-- por expediente, así que N ofertas → N contratos es legal en el esquema.
--
-- `aceptar_oferta` se deja intacta: la usa el cliente desde su propia pantalla
-- y ahí la adjudicación sigue siendo de una sola oferta.
--
-- Qué hace `adjudicar_ofertas`, en una sola transacción:
--   1. Rol administrador/estimador y expediente en 'en_oferta' o 'adjudicado'.
--   2. Rechaza si ya hay contratos firmados o en marcha: eso no se rehace desde
--      aquí, hay que cancelarlos primero.
--   3. Las seleccionadas pasan a 'aceptada' y las demás vivas a 'rechazada'
--      (con su fila en `oferta_auditoria`).
--   4. Borra los contratos re-adjudicables ('generado' / 'cancelado'). El PDF
--      en storage lo borra la aplicación, que captura las rutas antes de llamar.
--   5. Inserta un contrato por oferta seleccionada.
--   6. El expediente pasa a 'adjudicado'.
--
-- Devuelve (id_contrato, id_oferta) de cada contrato creado, que es lo que la
-- aplicación necesita para generar un PDF por contrato.
--
-- Nota sobre `seguimiento_obra`: el disparador `fn_contrato_crea_seguimiento`
-- actúa al FIRMAR, no al generar. Adjudicar a varios no crea seguimientos;
-- se creará uno por cada contrato que se acabe firmando.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjudicar_ofertas(
  p_expediente_id uuid,
  p_ofertas       uuid[]
)
RETURNS TABLE (id_contrato uuid, id_oferta uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol        text;
  v_estado     text;
  v_cliente_id uuid;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('administrador', 'estimador') THEN
    RAISE EXCEPTION 'No autorizado para adjudicar ofertas.';
  END IF;

  SELECT estado, cliente_id INTO v_estado, v_cliente_id
  FROM public.expediente WHERE id = p_expediente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El expediente no existe.';
  END IF;

  IF v_estado NOT IN ('en_oferta', 'adjudicado') THEN
    RAISE EXCEPTION 'El expediente no está en un estado válido para adjudicar (estado actual: %).', v_estado;
  END IF;

  IF array_length(p_ofertas, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos una oferta.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_ofertas) AS s(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.oferta o
      WHERE o.id = s.id
        AND o.expediente_id = p_expediente_id
        AND o.eliminada_en IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Alguna oferta de la selección no pertenece a este expediente o está eliminada.';
  END IF;

  -- Un contrato ya firmado o en marcha no se rehace desde aquí: hacerlo
  -- borraría obligaciones vivas y el seguimiento de obra asociado.
  IF EXISTS (
    SELECT 1 FROM public.contrato
    WHERE expediente_id = p_expediente_id
      AND estado IN ('firmado', 'en_ejecucion', 'completado')
  ) THEN
    RAISE EXCEPTION 'Hay contratos firmados o en ejecución en este expediente. Cancélalos antes de volver a adjudicar.';
  END IF;

  -- Bitácora antes de tocar nada: el snapshot debe ser el estado previo.
  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  SELECT o.id, p_expediente_id,
         CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END,
         auth.uid(), to_jsonb(o)
  FROM public.oferta o
  WHERE o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado IS DISTINCT FROM (
      CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END
    )::estado_oferta;

  UPDATE public.oferta o
  SET estado = CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END::estado_oferta
  WHERE o.expediente_id = p_expediente_id
    AND o.eliminada_en IS NULL
    AND o.estado IS DISTINCT FROM (
      CASE WHEN o.id = ANY(p_ofertas) THEN 'aceptada' ELSE 'rechazada' END
    )::estado_oferta;

  DELETE FROM public.contrato
  WHERE expediente_id = p_expediente_id
    AND estado IN ('generado', 'cancelado');

  RETURN QUERY
  WITH nuevos AS (
    INSERT INTO public.contrato (
      expediente_id, oferta_id, cliente_id, constructor_id,
      precio_final, garantia_anos, descripcion_trabajo, estado
    )
    SELECT p_expediente_id, o.id, v_cliente_id, o.constructor_id,
           o.precio, o.garantia_anos, o.descripcion, 'generado'
    FROM public.oferta o
    WHERE o.id = ANY(p_ofertas)
      AND o.expediente_id = p_expediente_id
      AND o.eliminada_en IS NULL
    RETURNING contrato.id AS c_id, contrato.oferta_id AS o_id
  )
  SELECT n.c_id, n.o_id FROM nuevos n;

  UPDATE public.expediente SET estado = 'adjudicado' WHERE id = p_expediente_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjudicar_ofertas(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjudicar_ofertas(uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.adjudicar_ofertas(uuid, uuid[]) TO authenticated;
