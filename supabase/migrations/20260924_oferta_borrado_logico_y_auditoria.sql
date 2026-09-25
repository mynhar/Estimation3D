-- ============================================================================
-- Borrado lógico y auditoría de ofertas
--
-- Motivo: `eliminar_oferta_admin` hacía DELETE físico. Con el CASCADE de
-- `archivo` y `contrato`, una oferta borrada no dejaba rastro alguno en la base
-- — ni quién, ni cuándo, ni qué contenía. El expediente EXP-20260626-8185
-- perdió así una oferta el 15/07/2026 y sólo se pudo reconstruir porque los
-- ficheros quedaron huérfanos en el bucket.
--
-- A partir de aquí:
--   · `oferta.eliminada_en` / `eliminada_por` marcan la baja; la fila se queda.
--   · `oferta_auditoria` guarda quién hizo qué y una copia de la fila.
--   · `restaurar_oferta_admin` deshace la baja.
--   · Todo lo que contaba o comparaba ofertas ignora las eliminadas.
--
-- Idempotente: se puede reaplicar sin efecto.
-- ============================================================================

-- ── 1. Columnas de baja ─────────────────────────────────────────────────────

ALTER TABLE public.oferta
  ADD COLUMN IF NOT EXISTS eliminada_en  timestamptz,
  ADD COLUMN IF NOT EXISTS eliminada_por uuid REFERENCES public.perfil(id);

COMMENT ON COLUMN public.oferta.eliminada_en  IS 'Baja lógica. NULL = oferta activa.';
COMMENT ON COLUMN public.oferta.eliminada_por IS 'Quién dio de baja la oferta.';

-- Índice parcial: las consultas de negocio filtran siempre por ofertas vivas.
CREATE INDEX IF NOT EXISTS oferta_vivas_por_expediente_idx
  ON public.oferta (expediente_id)
  WHERE eliminada_en IS NULL;

-- ── 2. Unicidad sólo entre ofertas vivas ────────────────────────────────────
-- La restricción original UNIQUE (expediente_id, constructor_id) impedía volver
-- a ofertar por un constructor cuya oferta anterior estuviera dada de baja: la
-- fila sigue ahí. Pasa a índice único parcial sobre las vivas.

ALTER TABLE public.oferta
  DROP CONSTRAINT IF EXISTS oferta_expediente_id_constructor_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS oferta_expediente_constructor_viva_uidx
  ON public.oferta (expediente_id, constructor_id)
  WHERE eliminada_en IS NULL;

-- ── 3. Bitácora ─────────────────────────────────────────────────────────────
-- Sin FK a `oferta` a propósito: el rastro tiene que sobrevivir aunque algún
-- día se purgue la fila de verdad.

CREATE TABLE IF NOT EXISTS public.oferta_auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id     uuid        NOT NULL,
  expediente_id uuid        NOT NULL,
  accion        text        NOT NULL CHECK (accion IN ('eliminada', 'restaurada')),
  actor_id      uuid        REFERENCES public.perfil(id),
  snapshot      jsonb       NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oferta_auditoria_oferta_idx     ON public.oferta_auditoria (oferta_id);
CREATE INDEX IF NOT EXISTS oferta_auditoria_expediente_idx ON public.oferta_auditoria (expediente_id, creado_en DESC);

ALTER TABLE public.oferta_auditoria ENABLE ROW LEVEL SECURITY;

-- Sólo lectura, y sólo para quien puede borrar. La escritura la hacen las
-- funciones SECURITY DEFINER, que no pasan por RLS: nadie puede falsear la
-- bitácora desde el cliente.
DROP POLICY IF EXISTS oferta_auditoria_select ON public.oferta_auditoria;
CREATE POLICY oferta_auditoria_select
  ON public.oferta_auditoria FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfil
      WHERE id = auth.uid() AND rol IN ('administrador', 'estimador')
    )
  );

-- ── 4. El tope de 5 cuenta sólo ofertas vivas ───────────────────────────────

CREATE OR REPLACE FUNCTION public.check_max_ofertas_por_expediente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.oferta
    WHERE expediente_id = NEW.expediente_id
      AND eliminada_en IS NULL
  ) >= 5 THEN
    RAISE EXCEPTION 'El expediente ya tiene el máximo de 5 ofertas permitidas.';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. Conteo por expediente: sólo vivas ────────────────────────────────────

-- SECURITY DEFINER se conserva: la cuenta la piden roles que no pueden leer
-- todas las ofertas por RLS. Firma idéntica a la anterior.
CREATE OR REPLACE FUNCTION public.contar_ofertas_expedientes(p_ids uuid[])
RETURNS TABLE (expediente_id uuid, total bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.expediente_id, COUNT(*)::bigint AS total
  FROM public.oferta o
  WHERE o.expediente_id = ANY(p_ids)
    AND o.eliminada_en IS NULL
  GROUP BY o.expediente_id;
$$;

-- ── 6. Eliminar = dar de baja ───────────────────────────────────────────────

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

  -- Dar de baja la adjudicada deshace la adjudicación: se va el contrato y las
  -- demás vuelven a 'pendiente' (su 'rechazada' describía un reparto anulado).
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

-- ── 7. Restaurar ────────────────────────────────────────────────────────────

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

  -- El trigger del tope y el índice único sólo actúan en INSERT; restaurar es
  -- un UPDATE, así que las dos reglas se comprueban aquí con un mensaje claro
  -- en lugar de dejar que reviente el índice.
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

  -- Vuelve como 'pendiente' si estaba adjudicada: esa adjudicación ya no existe
  -- y reactivarla dejaría dos aceptadas o un contrato fantasma.
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

-- ── 8. Aceptar / rechazar ignoran las ofertas dadas de baja ─────────────────

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
    AND expediente_id = p_expediente_id
    AND eliminada_en IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La oferta seleccionada no pertenece a este expediente o está eliminada.';
  END IF;

  UPDATE public.expediente
  SET estado = 'adjudicado'
  WHERE id = p_expediente_id;

  UPDATE public.oferta
  SET estado = 'aceptada'
  WHERE id = p_oferta_id
    AND expediente_id = p_expediente_id;

  -- Una oferta dada de baja no se rechaza: su estado quedó congelado el día que
  -- se eliminó y reescribirlo falsearía el histórico.
  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE expediente_id = p_expediente_id
    AND id <> p_oferta_id
    AND eliminada_en IS NULL;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.oferta
    WHERE id = p_oferta_id
      AND expediente_id = p_expediente_id
      AND estado = 'aceptada'
      AND eliminada_en IS NULL
  ) THEN
    RAISE EXCEPTION 'La oferta no está en estado aceptada o no pertenece a este expediente.';
  END IF;

  UPDATE public.oferta
  SET estado = 'rechazada'
  WHERE id = p_oferta_id;

  UPDATE public.expediente
  SET estado = 'estimado'
  WHERE id = p_expediente_id;

  DELETE FROM public.contrato
  WHERE oferta_id = p_oferta_id;
END;
$$;

-- ── 9. Permisos de ejecución ────────────────────────────────────────────────
-- Una función nueva nace con EXECUTE para PUBLIC (y por tanto para `anon`).
-- El resto de RPC del proyecto sólo las ejecuta `authenticated`; se iguala.

REVOKE EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.restaurar_oferta_admin(uuid, uuid) TO authenticated;
