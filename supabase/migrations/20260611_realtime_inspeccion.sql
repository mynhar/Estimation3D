-- Habilita Supabase Realtime sobre `inspeccion` para que el panel de
-- inspecciones del cliente y del constructor se actualice en vivo cuando se
-- agenda o elimina una visita.
--
-- REPLICA IDENTITY FULL: necesario para que el filtro de suscripción por
-- `seguimiento_id` también case en eventos DELETE (con DEFAULT, payload.old
-- solo trae la PK y el filtro no encontraría la columna).
ALTER TABLE public.inspeccion REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'inspeccion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inspeccion;
  END IF;
END;
$$;
