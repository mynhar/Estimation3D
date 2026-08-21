-- «Todos los servicios» como especialidad del constructor.
--
-- El selector de especialidad del alta/edición de usuarios ofrece, además de
-- los tipos de servicio activos, la opción «Todos los servicios» — y es la que
-- viene marcada por defecto.
--
-- Esa opción NO se guarda como `especialidad_id IS NULL`: ese estado ya existe
-- y significa «no se registró». Confundir ambos haría que una consulta del tipo
-- «¿qué constructores hacen descontaminación de moho?» devolviese en silencio a
-- todos los perfiles antiguos. Por eso lleva columna propia.

alter table public.perfil
  add column if not exists especialidad_todas boolean not null default false;

-- Las dos formas de responder a la misma pregunta son excluyentes: o cubre
-- todos los servicios, o se especializa en uno concreto.
alter table public.perfil
  drop constraint if exists perfil_especialidad_excluyente;
alter table public.perfil
  add constraint perfil_especialidad_excluyente
  check (not (especialidad_todas and especialidad_id is not null));

comment on column public.perfil.especialidad_todas is
  'Constructor: true = cubre todos los tipos de servicio. Excluyente con especialidad_id.';

notify pgrst, 'reload schema';
