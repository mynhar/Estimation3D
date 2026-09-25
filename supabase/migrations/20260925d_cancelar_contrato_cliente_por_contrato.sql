-- ============================================================================
-- El cliente cancela UN contrato, no el expediente entero
--
-- `cancelar_contrato(p_expediente_id)` hacía tres cosas de golpe:
--   · DELETE físico de TODOS los contratos del expediente
--   · TODAS las ofertas de vuelta a 'pendiente'
--   · el expediente a 'en_oferta'
--
-- Con un contrato por expediente pasaba desapercibido. Desde que administración
-- adjudica a varios constructores, el cliente que cancela el contrato de uno
-- cancelaba también los de los demás — y sin dejar rastro, porque borraba las
-- filas en lugar de marcarlas.
--
-- Su propia pantalla ya esperaba otra cosa: tras cancelar, la lista del cliente
-- marca SÓLO esa fila como 'cancelado' y deja el resto como estaba. El desajuste
-- estaba en la función.
--
-- `cancelar_contrato_cliente(p_contrato_id)` se comporta como su gemela de
-- administración: toca su contrato y su oferta, y nada más. La comprobación de
-- rol cambia por la de propiedad — tiene que ser el cliente del contrato.
--
-- La función antigua NO se elimina aquí a propósito: mientras el frontend
-- desplegado siga llamándola, borrarla dejaría al cliente sin botón. Una vez
-- desplegada esta versión, nada la invoca y se puede retirar con:
--
--     DROP FUNCTION public.cancelar_contrato(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_contrato_cliente(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente_id uuid;
  v_oferta_id     uuid;
  v_estado        text;
  v_oferta        public.oferta%ROWTYPE;
  v_activos       integer;
  v_vivas         integer;
BEGIN
  -- Propiedad: el contrato tiene que ser de quien llama.
  SELECT c.expediente_id, c.oferta_id, c.estado
    INTO v_expediente_id, v_oferta_id, v_estado
  FROM public.contrato c
  WHERE c.id = p_contrato_id
    AND c.cliente_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: el contrato no existe o no le pertenece.';
  END IF;

  IF v_estado = 'cancelado' THEN
    RAISE EXCEPTION 'El contrato ya está cancelado.';
  END IF;

  UPDATE public.contrato
  SET estado         = 'cancelado',
      actualizado_en = now()
  WHERE id = p_contrato_id;

  -- Sólo la oferta de ESTE contrato. Las demás conservan su estado: cada una
  -- tiene su propio contrato.
  SELECT * INTO v_oferta FROM public.oferta WHERE id = v_oferta_id;

  IF FOUND AND v_oferta.estado <> 'rechazada' THEN
    INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
    VALUES (v_oferta_id, v_expediente_id, 'rechazada', auth.uid(), to_jsonb(v_oferta));

    UPDATE public.oferta SET estado = 'rechazada' WHERE id = v_oferta_id;
  END IF;

  -- El expediente sólo retrocede si ya no queda ningún contrato en pie.
  SELECT COUNT(*) INTO v_activos
  FROM public.contrato
  WHERE expediente_id = v_expediente_id
    AND estado IN ('generado', 'firmado', 'en_ejecucion');

  IF v_activos = 0 THEN
    SELECT COUNT(*) INTO v_vivas
    FROM public.oferta
    WHERE expediente_id = v_expediente_id
      AND eliminada_en IS NULL
      AND estado <> 'rechazada';

    UPDATE public.expediente
    SET estado = CASE WHEN v_vivas > 0 THEN 'en_oferta' ELSE 'estimado' END::estado_expediente
    WHERE id = v_expediente_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancelar_contrato_cliente(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancelar_contrato_cliente(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancelar_contrato_cliente(uuid) TO authenticated;

-- ── `firmar_contrato` (cliente): mismo criterio que su gemela de admin ──────
-- Firmaba su contrato correctamente, pero pasaba el expediente a 'contratado'
-- con otros contratos aún sin firmar. 'contratado' describe al expediente
-- entero, así que sólo se aplica cuando no queda ninguna firma pendiente.
--
-- La comprobación de propiedad se deja como está: `IS DISTINCT FROM` sí trata
-- bien el NULL, a diferencia del `<>` que hubo que corregir en las de admin.

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
  v_pendientes    integer;
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

  UPDATE public.contrato
     SET estado         = 'firmado',
         firmado_en     = now(),
         actualizado_en = now()
   WHERE id = p_contrato_id;

  SELECT COUNT(*) INTO v_pendientes
  FROM public.contrato
  WHERE expediente_id = v_expediente_id
    AND estado = 'generado';

  IF v_pendientes = 0 THEN
    UPDATE public.expediente SET estado = 'contratado' WHERE id = v_expediente_id;
  END IF;
END;
$$;
