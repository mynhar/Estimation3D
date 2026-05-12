-- URL del tour virtual (Matterport u otro), guardada como texto plano.
ALTER TABLE estimacion
  ADD COLUMN IF NOT EXISTS url_tour text;
