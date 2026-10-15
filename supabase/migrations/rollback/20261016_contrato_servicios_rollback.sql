-- Rollback de `20261016_contrato_servicios.sql`.
--
-- Sin pérdida real: los servicios siguen en `oferta.servicio_ids`. Las pantallas
-- que leen `contrato.servicio_ids` dejarían de funcionar hasta revertir el código.

drop trigger  if exists trg_contrato_servicios on public.contrato;
drop function if exists public.fn_contrato_servicios();
alter table public.contrato drop column if exists servicio_ids;

notify pgrst, 'reload schema';
