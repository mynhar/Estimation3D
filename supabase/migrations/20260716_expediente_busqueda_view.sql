-- Búsqueda de expedientes por dirección (admin/file).
--
-- La lista admin pagina en servidor, así que el filtro debe resolverse en la
-- BD: filtrar en cliente sólo alcanzaría a la página actual y falsearía el
-- total. PostgREST no permite un OR entre tabla y tabla embebida, de modo que
-- se aplana expediente + localizacion en una vista con una columna de texto ya
-- normalizada sobre la que basta un ilike.

-- 1 — unaccent: "Montreal" debe encontrar "Montréal" (mercado de Quebec).
create extension if not exists unaccent with schema extensions;

-- 2 — Vista aplanada.
--     security_invoker: la vista se consulta con los permisos de quien llama,
--     así siguen aplicándose las RLS de las tablas base. Los joins son LEFT:
--     si una RLS oculta el perfil o el servicio, el expediente sigue listándose.
drop view if exists public.expediente_busqueda;

create view public.expediente_busqueda
with (security_invoker = true) as
select
  e.id,
  e.numero,
  e.estado,
  e.fecha_visita,
  e.creado_en,
  e.descripcion,
  e.cliente_id,
  e.estimador_id,
  e.servicio_id,
  l.direccion,
  l.provincia,
  l.canton,
  l.distrito,
  -- Texto de búsqueda: minúsculas y sin acentos. El cliente normaliza la
  -- consulta igual y lanza un ilike por término.
  -- Incluye cliente y servicio porque el placeholder del buscador ya los
  -- anunciaba aunque sólo se filtraba por número.
  -- `distrito` se repite sin espacios para que el código postal se encuentre
  -- tanto escrito "H8Y 3A3" como "H8Y3A3".
  lower(extensions.unaccent(
    concat_ws(' ',
      e.numero,
      c.nombre, c.apellido,
      s.nombre_es, s.nombre_fr, s.nombre_en,
      l.direccion,
      l.canton,
      l.provincia,
      l.distrito,
      replace(coalesce(l.distrito, ''), ' ', '')
    )
  )) as busqueda_texto
from public.expediente e
left join public.localizacion l on l.expediente_id = e.id
left join public.perfil      c on c.id = e.cliente_id
left join public.servicio    s on s.id = e.servicio_id;

comment on view public.expediente_busqueda is
  'Expediente + localizacion aplanados, con busqueda_texto normalizado (minúsculas, sin acentos) para el filtro server-side de la lista admin. security_invoker: hereda las RLS de las tablas base.';

grant select on public.expediente_busqueda to authenticated;

-- 3 — Que PostgREST vea la vista nueva.
notify pgrst, 'reload schema';
