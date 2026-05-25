-- Habilitar REPLICA IDENTITY FULL en las tablas que usan Supabase Realtime.
-- Sin esto, payload.old en eventos UPDATE solo contiene la PK (sin los
-- valores anteriores), lo que impide comparar el estado previo en el cliente.
ALTER TABLE public.expediente REPLICA IDENTITY FULL;
ALTER TABLE public.oferta     REPLICA IDENTITY FULL;

-- Agregar tablas a la publicación de Supabase Realtime (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'expediente'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expediente;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'oferta'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oferta;
  END IF;
END;
$$;
