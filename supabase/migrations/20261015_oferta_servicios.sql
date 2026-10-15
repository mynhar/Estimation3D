-- Servicios que cubre cada oferta.
--
-- Requiere `20261014_expediente_servicio.sql` y `20261014b_expediente_servicio_guardar.sql`.
--
-- Un expediente puede pedir varios servicios (`expediente_servicio`). Cada
-- oferta indica a cuáles se presenta —uno, varios o todos— con UN SOLO PRECIO
-- para el conjunto (`oferta.precio`, sin cambios).
--
-- Por qué una columna `int[]` en `oferta` y no una tabla puente como
-- `expediente_servicio`: las ofertas se guardan con un INSERT/UPDATE directo
-- desde la app (admin/offer/edit y builder/make-offer). Con una tabla aparte,
-- los servicios serían una segunda escritura que podría fallar después de
-- crear la oferta, y el reintento chocaría con el índice de una oferta viva
-- por constructor. En la propia fila, oferta y servicios se guardan juntos.
-- La integridad que daría una FK la pone el trigger del punto 3.

-- 1 — Columna. Orden = el del expediente (principal primero), lo fija el trigger.
alter table public.oferta
  add column if not exists servicio_ids int[] not null default '{}';

comment on column public.oferta.servicio_ids is
  'Servicios del expediente que cubre la oferta (uno, varios o todos), con un único precio para el conjunto. Un alta sin servicios cubre todos (lo rellena el trigger).';

-- 2 — Backfill: hasta hoy cada oferta cubría el expediente entero.
update public.oferta o
   set servicio_ids = s.ids
  from (
    select es.expediente_id,
           array_agg(es.servicio_id order by (es.servicio_id = e.servicio_id) desc, es.creado_en, es.servicio_id) as ids
      from public.expediente_servicio es
      join public.expediente e on e.id = es.expediente_id
     group by es.expediente_id
  ) s
 where s.expediente_id = o.expediente_id
   and cardinality(o.servicio_ids) = 0;

-- 3 — Validación y normalización.
--     · Solo servicios del expediente; sin repetidos; orden del expediente.
--     · Al menos uno. Un INSERT sin servicios (constructor con la app antigua,
--       expediente de un solo servicio) cubre todos.
--     · Una oferta dada de baja no se valida: su lista puede haberse quedado
--       vieja. Al restaurarla (eliminada_en → NULL) sí se valida.
--     SECURITY DEFINER: lee `expediente_servicio` sin depender de las RLS de
--     quien guarda (el constructor solo ve algunos expedientes).
create or replace function public.fn_oferta_servicios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validos int[];
  v_pedidos int[] := coalesce(new.servicio_ids, '{}');
  v_norm    int[];
begin
  if new.eliminada_en is not null then
    return new;
  end if;

  select coalesce(array_agg(es.servicio_id order by (es.servicio_id = e.servicio_id) desc, es.creado_en, es.servicio_id), '{}')
    into v_validos
    from public.expediente_servicio es
    join public.expediente e on e.id = es.expediente_id
   where es.expediente_id = new.expediente_id;

  if exists (
    select 1 from unnest(v_pedidos) as x
     where x is not null and x <> all (v_validos)
  ) then
    raise exception 'La oferta cubre servicios que el expediente no tiene.';
  end if;

  v_norm := array(select x from unnest(v_validos) as x where x = any (v_pedidos));

  if cardinality(v_norm) = 0 then
    if tg_op = 'INSERT' then
      v_norm := v_validos;
    else
      raise exception 'La oferta debe cubrir al menos un servicio.';
    end if;
  end if;

  new.servicio_ids := v_norm;
  return new;
end;
$$;

comment on function public.fn_oferta_servicios() is
  'Valida y normaliza oferta.servicio_ids contra expediente_servicio. Alta sin servicios = todos.';

drop trigger if exists trg_oferta_servicios on public.oferta;

create trigger trg_oferta_servicios
  before insert or update of servicio_ids, expediente_id, eliminada_en on public.oferta
  for each row
  execute function public.fn_oferta_servicios();

-- 4 — El trigger del principal ya no borra el anterior.
--     En `20261014_expediente_servicio.sql`, al cambiar `expediente.servicio_id`
--     se quitaba el principal viejo de la lista. Con ofertas apuntando a
--     servicios eso es peligroso: `guardar_servicios_expediente` cambia el
--     principal ANTES de rehacer la lista, y un servicio que solo cambia de
--     puesto desaparecería un instante. Quitar servicios es ahora cosa
--     exclusiva de `guardar_servicios_expediente`, que comprueba las ofertas.
create or replace function public.fn_expediente_servicio_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.servicio_id is not distinct from old.servicio_id then
    return new;
  end if;

  insert into public.expediente_servicio (expediente_id, servicio_id)
  values (new.id, new.servicio_id)
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.fn_expediente_servicio_principal() is
  'Mantiene expediente.servicio_id dentro de expediente_servicio. Solo añade: quitar servicios es cosa de guardar_servicios_expediente.';

-- 5 — `guardar_servicios_expediente` no quita servicios que tengan ofertas.
--     Cada oferta tiene un único precio para todos sus servicios: si el
--     expediente perdiera uno que una oferta viva cubre, ese precio dejaría de
--     corresponder a nada. Hay que editar o dar de baja la oferta antes.
--     Resto idéntico a `20261014b_expediente_servicio_guardar.sql`.
create or replace function public.guardar_servicios_expediente(
  p_expediente_id uuid,
  p_servicios     int[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicios int[];
begin
  if mi_rol() is null
     or mi_rol() not in ('estimador'::rol_usuario, 'administrador'::rol_usuario) then
    raise exception 'No autorizado para cambiar los servicios del expediente.';
  end if;

  -- Sin repetidos, conservando el orden: el primero sigue siendo el principal.
  select array_agg(s.id order by s.pos)
    into v_servicios
    from (
      select distinct on (id) id, pos
        from unnest(p_servicios) with ordinality as t(id, pos)
       where id is not null
       order by id, pos
    ) s;

  if v_servicios is null then
    raise exception 'Selecciona al menos un servicio.';
  end if;

  if exists (
    select 1 from unnest(v_servicios) as t(id)
     where not exists (select 1 from public.servicio s where s.id = t.id)
  ) then
    raise exception 'Algún servicio de la selección no existe.';
  end if;

  if not exists (select 1 from public.expediente where id = p_expediente_id) then
    raise exception 'El expediente no existe.';
  end if;

  if exists (
    select 1
      from public.oferta o, unnest(o.servicio_ids) as x
     where o.expediente_id = p_expediente_id
       and o.eliminada_en is null
       and x <> all (v_servicios)
  ) then
    raise exception using
      message = 'No se puede quitar un servicio que ya tiene ofertas. Edita o da de baja esas ofertas antes.',
      hint    = 'servicio_con_ofertas';
  end if;

  update public.expediente
     set servicio_id = v_servicios[1]
   where id = p_expediente_id
     and servicio_id is distinct from v_servicios[1];

  delete from public.expediente_servicio
   where expediente_id = p_expediente_id
     and servicio_id <> all (v_servicios);

  insert into public.expediente_servicio (expediente_id, servicio_id)
  select p_expediente_id, t.id from unnest(v_servicios) as t(id)
  on conflict do nothing;
end;
$$;

comment on function public.guardar_servicios_expediente(uuid, int[]) is
  'Estimador / administrador: fija los servicios de un expediente. El primero del array pasa a expediente.servicio_id; expediente_servicio queda exactamente con la selección. Rechaza quitar servicios que cubre alguna oferta viva.';

revoke execute on function public.guardar_servicios_expediente(uuid, int[]) from public;
revoke execute on function public.guardar_servicios_expediente(uuid, int[]) from anon;
grant  execute on function public.guardar_servicios_expediente(uuid, int[]) to authenticated;

notify pgrst, 'reload schema';
