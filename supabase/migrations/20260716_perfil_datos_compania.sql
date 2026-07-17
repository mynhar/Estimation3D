-- Datos de compañía del constructor (sección Compañía en el alta/edición de
-- usuarios del panel admin).
--
-- Van en `perfil` y no en una tabla aparte: son cuatro campos opcionales
-- ligados a cada constructor, sin requisito de compartir compañía entre
-- varios. `perfil` ya guarda teléfono, email y avatar, así que encaja.
-- Todas nullable: los cuatro campos son opcionales, y los usuarios que no son
-- constructores nunca los rellenan.

alter table public.perfil
  add column if not exists compania_nombre    text,
  add column if not exists compania_telefono  text,
  add column if not exists compania_email     text,
  add column if not exists compania_direccion text;

comment on column public.perfil.compania_nombre    is 'Constructor: nombre de la compañía (opcional).';
comment on column public.perfil.compania_telefono  is 'Constructor: teléfono de la compañía (opcional).';
comment on column public.perfil.compania_email     is 'Constructor: correo de la compañía (opcional).';
comment on column public.perfil.compania_direccion is 'Constructor: dirección de la compañía (opcional).';

-- Las RLS de `perfil` son a nivel de fila, así que las columnas nuevas quedan
-- cubiertas por las políticas existentes sin cambios.

notify pgrst, 'reload schema';
