-- Estado «archivado» para expediente, oferta y contrato, y dónde guardar el
-- estado anterior para poder restaurarlo más adelante.
--
-- Primera de dos: `20261103c_archivar_expediente.sql` añade la RPC y las
-- guardias. Van separadas porque un valor nuevo de un enum no se puede usar en
-- la misma transacción que lo crea.
--
--   · expediente.estado_anterior        estado antes de archivar
--   · expediente.archivado_en           cuándo se archivó (lo muestran los avisos)
--   · oferta.estado_anterior            ídem, por oferta
--   · contrato.estado_anterior          ídem, por contrato
--   · seguimiento_obra.estado_anterior  estado antes de pausarse por el archivo
--
-- Todas quedan a NULL mientras el registro no esté archivado (o pausado por
-- archivo). No tocan datos existentes.

alter type public.estado_expediente add value if not exists 'archivado';
alter type public.estado_oferta     add value if not exists 'archivado';
alter type public.estado_contrato   add value if not exists 'archivado';

alter table public.expediente
  add column if not exists estado_anterior public.estado_expediente,
  add column if not exists archivado_en    timestamptz;

alter table public.oferta
  add column if not exists estado_anterior public.estado_oferta;

alter table public.contrato
  add column if not exists estado_anterior public.estado_contrato;

alter table public.seguimiento_obra
  add column if not exists estado_anterior public.estado_seguimiento;

comment on column public.expediente.estado_anterior is
  'Estado que tenía al archivarse; se restaura al desarchivar. NULL si no está archivado.';
comment on column public.expediente.archivado_en is
  'Momento en que se archivó. NULL si no está archivado.';
comment on column public.oferta.estado_anterior is
  'Estado que tenía al archivarse su expediente. NULL si no está archivada.';
comment on column public.contrato.estado_anterior is
  'Estado que tenía al archivarse su expediente. NULL si no está archivado.';
comment on column public.seguimiento_obra.estado_anterior is
  'Estado que tenía al pausarse por el archivo de su expediente. NULL si no.';
