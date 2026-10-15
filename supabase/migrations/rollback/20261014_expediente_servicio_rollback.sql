-- Rollback de `20261014_expediente_servicio.sql`.
--
-- Atención: se pierden los servicios adicionales de los expedientes creados con
-- varios. El principal sigue en `expediente.servicio_id`.

drop trigger  if exists trg_expediente_servicio_principal on public.expediente;
drop function if exists public.fn_expediente_servicio_principal();
drop table    if exists public.expediente_servicio;

notify pgrst, 'reload schema';
