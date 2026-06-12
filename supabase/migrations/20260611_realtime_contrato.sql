-- Habilita Supabase Realtime sobre la tabla `contrato` para notificar al
-- cliente cuando su obra cambia de estado (p. ej. arranque de ejecución).
--
-- REPLICA IDENTITY FULL: necesario para que payload.old incluya el estado
-- anterior en eventos UPDATE y poder comparar la transición en el cliente.
ALTER TABLE public.contrato REPLICA IDENTITY FULL;

-- Agregar `contrato` a la publicación de Supabase Realtime (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contrato'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contrato;
  END IF;
END;
$$;
