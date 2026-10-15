-- Edición de los servicios de un expediente (`admin/file/edit` y
-- `estimator/file/edit`).
--
-- Requiere `20261014_expediente_servicio.sql`.
--
-- Guardar la selección son tres escrituras —principal, bajas y altas— que
-- tienen que ir juntas: si fallara una a medias, el expediente quedaría con un
-- principal que no está en su lista o con servicios que ya se habían quitado.
-- Por eso es un RPC atómico y no tres llamadas desde el cliente. Tampoco hace
-- falta abrir una política DELETE sobre `expediente_servicio`: la única vía
-- para quitar servicios es esta función.
--
-- Quién puede: los mismos roles que pueden editar el expediente según la
-- política vigente `expediente_update` (20260717_invitacion_constructores.sql):
-- estimador y administrador. El cliente no edita expedientes.
--
-- `p_servicios` llega en orden de prioridad: el primero es el principal
-- (`expediente.servicio_id`). Los repetidos se ignoran.

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

  -- Principal. El trigger `trg_expediente_servicio_principal` reacciona a este
  -- UPDATE; las dos sentencias siguientes dejan la lista exacta igualmente.
  update public.expediente
     set servicio_id = v_servicios[1]
   where id = p_expediente_id
     and servicio_id is distinct from v_servicios[1];

  if not exists (select 1 from public.expediente where id = p_expediente_id) then
    raise exception 'El expediente no existe.';
  end if;

  delete from public.expediente_servicio
   where expediente_id = p_expediente_id
     and servicio_id <> all (v_servicios);

  insert into public.expediente_servicio (expediente_id, servicio_id)
  select p_expediente_id, t.id from unnest(v_servicios) as t(id)
  on conflict do nothing;
end;
$$;

comment on function public.guardar_servicios_expediente(uuid, int[]) is
  'Estimador / administrador: fija los servicios de un expediente. El primero del array pasa a expediente.servicio_id; expediente_servicio queda exactamente con la selección.';

revoke execute on function public.guardar_servicios_expediente(uuid, int[]) from public;
revoke execute on function public.guardar_servicios_expediente(uuid, int[]) from anon;
grant  execute on function public.guardar_servicios_expediente(uuid, int[]) to authenticated;

notify pgrst, 'reload schema';
