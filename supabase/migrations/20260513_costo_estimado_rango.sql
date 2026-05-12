-- El costo estimado pasa a ser un rango (mínimo / máximo), ambos opcionales.
-- La columna existente costo_estimado se convierte en el extremo inferior del rango.

ALTER TABLE estimacion
  ALTER COLUMN costo_estimado DROP NOT NULL,
  ALTER COLUMN costo_estimado SET DEFAULT NULL;

ALTER TABLE estimacion
  ADD COLUMN IF NOT EXISTS costo_estimado_max numeric;
