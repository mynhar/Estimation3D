-- ============================================================================
-- FIX de seguridad sobre 20260924_oferta_borrado_logico_y_auditoria.sql
--
-- Este archivo existe porque la migración anterior YA se aplicó a producción
-- antes de detectar los dos fallos. En un entorno nuevo, la migración base ya
-- viene corregida y esto es un no-op idempotente; aquí queda como registro de
-- lo que se ejecutó sobre la base en vivo.
--
-- 1) GRANT por defecto. `restaurar_oferta_admin`, al ser una función nueva,
--    nació con EXECUTE para PUBLIC — y por tanto para el rol `anon`. Las demás
--    RPC del proyecto sólo las ejecuta `authenticated`.
--
-- 2) Guarda de rol que no cortaba con NULL. El patrón heredado era:
--
--        IF v_rol NOT IN ('administrador', 'estimador') THEN RAISE ...
--
--    En SQL, `NULL NOT IN (...)` no es TRUE ni FALSE: es NULL. Y un
--    `IF NULL THEN` no entra. Es decir, quien NO tiene fila en `perfil`
--    —un anónimo, o un usuario cuyo trigger de alta falló— se saltaba la
--    comprobación entera en lugar de ser rechazado. Combinado con (1), un
--    anónimo que conociera los dos UUID podía restaurar una oferta.
--
--    El patrón venía del `eliminar_oferta_admin` original, así que se corrige
--    en las dos funciones. `aceptar_oferta` y `rechazar_oferta` no lo tienen:
--    resuelven el permiso contra `expediente` y ahí el NULL sí descarta la fila.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eliminar_oferta_admin(
  p_oferta_id     uuid,
  p_expediente_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
  v_of  public.oferta%ROWTYPE;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('administrador', 'estimador') THEN
    RAISE EXCEPTION 'No autorizado para eliminar ofertas.';
  END IF;

  SELECT * INTO v_of
  FROM public.oferta
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id
    AND eliminada_en IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La oferta no existe, ya está eliminada o no pertenece a este expediente.';
  END IF;

  IF v_of.estado = 'aceptada' THEN
    DELETE FROM public.contrato
    WHERE oferta_id = p_oferta_id AND estado = 'generado';

    UPDATE public.oferta
    SET estado = 'pendiente'
    WHERE expediente_id = p_expediente_id
      AND id <> p_oferta_id
      AND eliminada_en IS NULL;
  END IF;

  UPDATE public.oferta
  SET eliminada_en  = now(),
      eliminada_por = auth.uid()
  WHERE id = p_oferta_id;

  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  VALUES (p_oferta_id, p_expediente_id, 'eliminada', auth.uid(), to_jsonb(v_of));

  IF NOT EXISTS (
    SELECT 1 FROM public.oferta
    WHERE expediente_id = p_expediente_id AND eliminada_en IS NULL
  ) THEN
    UPDATE public.expediente SET estado = 'estimado' WHERE id = p_expediente_id;
  ELSIF v_of.estado = 'aceptada' THEN
    UPDATE public.expediente SET estado = 'en_oferta' WHERE id = p_expediente_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_oferta_admin(
  p_oferta_id     uuid,
  p_expediente_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol   text;
  v_of    public.oferta%ROWTYPE;
  v_vivas integer;
BEGIN
  SELECT rol INTO v_rol FROM public.perfil WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('administrador', 'estimador') THEN
    RAISE EXCEPTION 'No autorizado para restaurar ofertas.';
  END IF;

  SELECT * INTO v_of
  FROM public.oferta
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id
    AND eliminada_en IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La oferta no existe, no está eliminada o no pertenece a este expediente.';
  END IF;

  SELECT COUNT(*) INTO v_vivas
  FROM public.oferta
  WHERE expediente_id = p_expediente_id AND eliminada_en IS NULL;

  IF v_vivas >= 5 THEN
    RAISE EXCEPTION 'El expediente ya tiene el máximo de 5 ofertas activas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.oferta
    WHERE expediente_id  = p_expediente_id
      AND constructor_id = v_of.constructor_id
      AND eliminada_en IS NULL
  ) THEN
    RAISE EXCEPTION 'Ese constructor ya tiene una oferta activa en este expediente.';
  END IF;

  UPDATE public.oferta
  SET eliminada_en  = NULL,
      eliminada_por = NULL,
      estado        = CASE WHEN estado = 'aceptada' THEN 'pendiente'::estado_oferta ELSE estado END
  WHERE id = p_oferta_id;

  INSERT INTO public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  VALUES (p_oferta_id, p_expediente_id, 'restaurada', auth.uid(), to_jsonb(v_of));

  UPDATE public.expediente
  SET estado = 'en_oferta'
  WHERE id = p_expediente_id AND estado = 'estimado';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) TO authenticated;
