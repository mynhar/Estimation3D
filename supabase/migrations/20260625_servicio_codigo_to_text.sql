-- servicio.codigo era un enum fijo (tipo_servicio), incompatible con el CRUD
-- de admin que permite crear tipos de servicio con codigo libre.
-- Se convierte a text; la restriccion UNIQUE (servicio_codigo_key) se conserva.
alter table public.servicio
  alter column codigo type text using codigo::text;

-- El enum ya no lo usa ninguna columna ni funcion: se elimina.
drop type if exists public.tipo_servicio;
