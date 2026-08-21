-- Datos profesionales del constructor (alta de usuarios del panel admin).
--
-- Mismo criterio que `20260716_perfil_datos_compania.sql` y
-- `20260812_perfil_direccion.sql`: son campos planos ligados a una sola
-- persona, sin necesidad de compartirse ni de historial, así que van en
-- `perfil` y no en una tabla aparte.
--
-- Sólo tienen sentido para el rol `constructor`; para cualquier otro rol la
-- edge function `crear-usuario` los graba como NULL. No se añade un CHECK que
-- ate las columnas al rol: el rol de un perfil puede cambiar y la restricción
-- convertiría ese cambio en un error de escritura.

alter table public.perfil
  add column if not exists rbq                text,
  add column if not exists especialidad_id    int  references public.servicio(id) on delete set null,
  add column if not exists anios_experiencia  smallint,
  add column if not exists zona_servicio      text,
  add column if not exists mensaje            text;

-- Licencia RBQ de Quebec: diez dígitos en tres bloques, «0000-0000-00».
-- El CHECK deja pasar NULL (los roles que no son constructor y los perfiles
-- creados antes de esta migración).
alter table public.perfil
  drop constraint if exists perfil_rbq_formato;
alter table public.perfil
  add constraint perfil_rbq_formato
  check (rbq is null or rbq ~ '^[0-9]{4}-[0-9]{4}-[0-9]{2}$');

alter table public.perfil
  drop constraint if exists perfil_anios_experiencia_rango;
alter table public.perfil
  add constraint perfil_anios_experiencia_rango
  check (anios_experiencia is null or anios_experiencia between 0 and 80);

comment on column public.perfil.rbq               is 'Constructor: número de licencia RBQ, formato 0000-0000-00.';
comment on column public.perfil.especialidad_id   is 'Constructor: tipo de servicio en el que se especializa (FK a servicio, uno solo).';
comment on column public.perfil.anios_experiencia is 'Constructor: años de experiencia en el oficio (0-80).';
comment on column public.perfil.zona_servicio     is 'Constructor: zona geográfica que cubre, p. ej. «Montréal et la couronne nord».';
comment on column public.perfil.mensaje           is 'Constructor: nota libre sobre su enfoque, obras recientes o preguntas (opcional).';

-- El índice sirve al listado de constructores por especialidad; parcial porque
-- la columna sólo se rellena para el rol constructor.
create index if not exists perfil_especialidad_id_idx
  on public.perfil (especialidad_id)
  where especialidad_id is not null;

-- Las RLS de `perfil` son a nivel de fila: las columnas nuevas quedan cubiertas
-- por las políticas existentes sin cambios.

notify pgrst, 'reload schema';
