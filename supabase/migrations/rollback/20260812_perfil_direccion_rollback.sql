-- Rollback de `20260812_perfil_direccion.sql`.
--
-- Atención: elimina los datos de dirección personal ya capturados. No hay copia
-- en ninguna otra tabla.

alter table public.perfil
  drop column if exists direccion_unidad,
  drop column if exists direccion_calle,
  drop column if exists direccion_ciudad,
  drop column if exists direccion_provincia,
  drop column if exists direccion_codigo_postal;

notify pgrst, 'reload schema';
