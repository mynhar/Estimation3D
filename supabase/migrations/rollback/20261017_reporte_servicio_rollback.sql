-- Rollback de `20261017_reporte_servicio.sql`.
--
-- Atención: se pierde en qué servicio se trabajó cada día. La fase de cada parte
-- se conserva (y con ella, indirectamente, su servicio).

drop trigger  if exists trg_reporte_actividad_servicio on public.reporte_actividad;
drop function if exists public.fn_reporte_actividad_servicio();
drop trigger  if exists trg_reporte_servicio on public.reporte_diario;
drop function if exists public.fn_reporte_servicio();
alter table public.reporte_diario drop column if exists servicio_id;

notify pgrst, 'reload schema';
