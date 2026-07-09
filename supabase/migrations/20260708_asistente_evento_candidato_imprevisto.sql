-- Añade el tipo de evento 'candidato_imprevisto' (F3 del estimador: imprevisto
-- nuevo observado en sitio, fuera del catálogo, para revisión humana).
-- Aplicada vía MCP el 2026-07-08 (proyecto ckdksfvxjimxuqceoeyr).

alter table public.asistente_evento drop constraint if exists asistente_evento_tipo_check;
alter table public.asistente_evento add constraint asistente_evento_tipo_check
  check (tipo in (
    'salud_mencionada',
    'escalada_humana',
    'caso_externo',
    'evidencia_incompleta_imprevisto',
    'imprevisto_anticipado',
    'candidato_imprevisto'));
