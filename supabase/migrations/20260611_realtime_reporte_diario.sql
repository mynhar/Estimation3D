-- Habilita Supabase Realtime sobre `reporte_diario` para que la vista del
-- cliente (client/construction-monitoring/list) se actualice en vivo cuando
-- el constructor registra o modifica un parte diario.
--
-- No se necesita REPLICA IDENTITY FULL: la vista solo reacciona al hecho de
-- que hubo un cambio (recarga la obra), no compara el estado anterior. El RLS
-- de reporte_diario ya restringe los eventos al cliente dueño de la obra.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'reporte_diario'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reporte_diario;
  END IF;
END;
$$;
