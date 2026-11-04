-- Rollback de 20261103d_archivado_solo_admin.sql.
-- Quita la guardia «solo el administrador modifica lo archivado». Las guardias
-- de 20261103c (estados, ofertas, contratos, partes y avance) siguen en pie.

do $$
declare
  t text;
begin
  foreach t in array array[
    'expediente', 'localizacion', 'estimacion', 'expediente_servicio',
    'expediente_invitacion', 'matterport_modelo', 'oferta', 'contrato',
    'seguimiento_obra', 'reporte_diario', 'reporte_actividad', 'reporte_zona',
    'inspeccion', 'archivo'
  ] loop
    execute format('drop trigger if exists trg_archivado_solo_admin on public.%I', t);
  end loop;
end;
$$;

drop function if exists public.fn_guardia_archivado_solo_admin();
drop function if exists public.fn_expediente_de_fila(text, jsonb);
