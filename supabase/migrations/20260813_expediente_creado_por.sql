-- Autoría del expediente: quién lo creó, de forma permanente.
--
-- Hasta ahora el único vínculo entre un estimador y el expediente que dio de
-- alta era `expediente.estimador_id`, que NO es un campo de autoría sino de
-- asignación: `asignarEstimador()` lo reescribe cuando otro estimador toma el
-- expediente y `liberar()` lo pone a NULL. El creador perdía su expediente de
-- vista. Mismo problema que ya se resolvió para las RLS de seguimiento de obra
-- en `20260810_rls_estimador_expediente_estimado.sql`, pero allí la autoría se
-- recuperaba de `estimacion.estimador_id`, que sólo existe si ya se estimó.
--
-- `creado_por` es el dato que faltaba: se sella una vez, en el alta, y no vuelve
-- a cambiar. Vale para cualquier rol (cliente, estimador o administrador que
-- crea por cuenta de un cliente), no sólo para el estimador.

-- 1 — Columna. Nullable: los expedientes ya existentes no tienen forma fiable de
--     saber quién los creó (`estimador_id` es asignación, no autoría), así que
--     se quedan en NULL en vez de inventar un autor. ON DELETE SET NULL para no
--     bloquear la baja de un perfil.
alter table public.expediente
  add column if not exists creado_por uuid references public.perfil(id) on delete set null;

-- 2 — Default `auth.uid()`: el sello no depende de que cada pantalla se acuerde
--     de enviarlo. Con PostgREST el INSERT corre con el JWT del usuario, así que
--     la columna queda con quien realmente creó la fila. Desde el service_role o
--     el SQL editor `auth.uid()` es NULL y la columna queda NULL, que es lo
--     correcto: ahí no hay un usuario que sea el autor.
alter table public.expediente
  alter column creado_por set default auth.uid();

comment on column public.expediente.creado_por is
  'Usuario que dio de alta el expediente. Se sella en el INSERT (default auth.uid()) y es inmutable: a diferencia de estimador_id, no cambia al reasignar ni al liberar el expediente.';

-- 3 — Índice: la lista del estimador filtra por esta columna en cada carga.
create index if not exists expediente_creado_por_idx
  on public.expediente (creado_por);

-- 4 — Inmutabilidad. Sin esto, `creado_por` sería tan frágil como `estimador_id`:
--     cualquier UPDATE que mande la fila entera podría pisarlo. El trigger
--     restaura el valor original en silencio en vez de lanzar una excepción, para
--     no romper los UPDATE que hoy envían columnas de más.
--     Un NULL sí puede rellenarse una vez (expedientes antiguos, altas por
--     service_role); lo que no se permite es cambiar un autor ya sellado.
create or replace function public.fn_expediente_creado_por_inmutable()
returns trigger
language plpgsql
as $$
begin
  if old.creado_por is not null and new.creado_por is distinct from old.creado_por then
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$$;

comment on function public.fn_expediente_creado_por_inmutable() is
  'Impide que un UPDATE cambie expediente.creado_por una vez sellado; restaura el valor anterior en silencio.';

drop trigger if exists trg_expediente_creado_por_inmutable on public.expediente;

create trigger trg_expediente_creado_por_inmutable
  before update on public.expediente
  for each row
  execute function public.fn_expediente_creado_por_inmutable();

-- 5 — Que nadie pueda firmar el alta con el nombre de otro. La política de INSERT
--     se conserva tal cual estaba (mismos roles, mismas condiciones) y sólo se le
--     añade la restricción sobre la columna nueva.
drop policy if exists "expediente_insert" on public.expediente;

create policy "expediente_insert"
on public.expediente for insert to authenticated
with check (
  (
    mi_rol() = any (array['estimador'::rol_usuario, 'administrador'::rol_usuario])
    or (mi_rol() = 'cliente'::rol_usuario and cliente_id = auth.uid())
  )
  and (creado_por is null or creado_por = auth.uid())
);

-- 6 — La vista de búsqueda expone la columna nueva para que un filtro
--     server-side por autor sea posible sin volver a tocar la vista.
--     Definición idéntica a `20260716_expediente_busqueda_view.sql` + creado_por.
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
  e.creado_por,
  e.servicio_id,
  l.direccion,
  l.provincia,
  l.canton,
  l.distrito,
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
  'Expediente + localizacion aplanados, con busqueda_texto normalizado (minusculas, sin acentos) para el filtro server-side de la lista admin. security_invoker: hereda las RLS de las tablas base.';

grant select on public.expediente_busqueda to authenticated;

-- 7 — Que PostgREST vea la columna y la vista nuevas.
notify pgrst, 'reload schema';
