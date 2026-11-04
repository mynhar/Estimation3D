-- Rollback de `20261103b_estado_archivado.sql`.
--
-- Aplicar antes el rollback de `20261103c_archivar_expediente.sql`.
--
-- Quita las columnas. Los valores 'archivado' de los enums NO se quitan:
-- Postgres no permite borrar un valor de un enum sin recrear el tipo. Quedan
-- sin uso. Si hubiera filas en 'archivado', este rollback las devuelve antes a
-- su estado anterior para que no queden huérfanas.

update public.oferta     set estado = estado_anterior where estado = 'archivado' and estado_anterior is not null;
update public.contrato   set estado = estado_anterior where estado = 'archivado' and estado_anterior is not null;
update public.seguimiento_obra set estado = estado_anterior where estado_anterior is not null;
update public.expediente set estado = estado_anterior where estado = 'archivado' and estado_anterior is not null;

alter table public.seguimiento_obra drop column if exists estado_anterior;
alter table public.contrato         drop column if exists estado_anterior;
alter table public.oferta           drop column if exists estado_anterior;
alter table public.expediente       drop column if exists archivado_en,
                                    drop column if exists estado_anterior;
