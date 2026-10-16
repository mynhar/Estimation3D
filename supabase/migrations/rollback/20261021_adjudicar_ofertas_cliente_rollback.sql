-- Rollback de `20261021_adjudicar_ofertas_cliente.sql`.
--
-- adjudicar_ofertas vuelve a ser solo de administrador / estimador, y
-- rechazar_oferta vuelve a devolver siempre el expediente a 'estimado' y a
-- borrar el contrato de la oferta sea cual sea su estado.

create or replace function public.adjudicar_ofertas(p_expediente_id uuid, p_ofertas uuid[])
returns table(id_contrato uuid, id_oferta uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol        text;
  v_estado     text;
  v_cliente_id uuid;
begin
  select rol into v_rol from public.perfil where id = auth.uid();
  if v_rol is null or v_rol not in ('administrador', 'estimador') then
    raise exception 'No autorizado para adjudicar ofertas.';
  end if;

  select estado, cliente_id into v_estado, v_cliente_id
  from public.expediente where id = p_expediente_id;

  if not found then
    raise exception 'El expediente no existe.';
  end if;

  if v_estado not in ('en_oferta', 'adjudicado') then
    raise exception 'El expediente no está en un estado válido para adjudicar (estado actual: %).', v_estado;
  end if;

  if array_length(p_ofertas, 1) is null then
    raise exception 'Selecciona al menos una oferta.';
  end if;

  if exists (
    select 1 from unnest(p_ofertas) as s(id)
    where not exists (
      select 1 from public.oferta o
      where o.id = s.id
        and o.expediente_id = p_expediente_id
        and o.eliminada_en is null
    )
  ) then
    raise exception 'Alguna oferta de la selección no pertenece a este expediente o está eliminada.';
  end if;

  if exists (
    select 1 from public.contrato
    where expediente_id = p_expediente_id
      and estado in ('firmado', 'en_ejecucion', 'completado')
  ) then
    raise exception 'Hay contratos firmados o en ejecución en este expediente. Cancélalos antes de volver a adjudicar.';
  end if;

  insert into public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
  select o.id, p_expediente_id,
         case when o.id = any(p_ofertas) then 'aceptada' else 'rechazada' end,
         auth.uid(), to_jsonb(o)
  from public.oferta o
  where o.expediente_id = p_expediente_id
    and o.eliminada_en is null
    and o.estado is distinct from (
      case when o.id = any(p_ofertas) then 'aceptada' else 'rechazada' end
    )::estado_oferta;

  update public.oferta o
  set estado = case when o.id = any(p_ofertas) then 'aceptada' else 'rechazada' end::estado_oferta
  where o.expediente_id = p_expediente_id
    and o.eliminada_en is null
    and o.estado is distinct from (
      case when o.id = any(p_ofertas) then 'aceptada' else 'rechazada' end
    )::estado_oferta;

  delete from public.contrato
  where expediente_id = p_expediente_id
    and estado in ('generado', 'cancelado');

  return query
  with nuevos as (
    insert into public.contrato (
      expediente_id, oferta_id, cliente_id, constructor_id,
      precio_final, garantia_anos, descripcion_trabajo, estado
    )
    select p_expediente_id, o.id, v_cliente_id, o.constructor_id,
           o.precio, o.garantia_anos, o.descripcion, 'generado'
    from public.oferta o
    where o.id = any(p_ofertas)
      and o.expediente_id = p_expediente_id
      and o.eliminada_en is null
    returning contrato.id as c_id, contrato.oferta_id as o_id
  )
  select n.c_id, n.o_id from nuevos n;

  update public.expediente set estado = 'adjudicado' where id = p_expediente_id;
end;
$function$;

create or replace function public.rechazar_oferta(p_expediente_id uuid, p_oferta_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
begin
  select rol into v_rol from public.perfil where id = auth.uid();

  if not exists (
    select 1 from public.expediente
    where id = p_expediente_id
      and (cliente_id = auth.uid() or v_rol in ('administrador', 'estimador'))
  ) then
    raise exception 'No autorizado: el expediente no existe o no le pertenece.';
  end if;

  if not exists (
    select 1 from public.oferta
    where id = p_oferta_id
      and expediente_id = p_expediente_id
      and estado = 'aceptada'
      and eliminada_en is null
  ) then
    raise exception 'La oferta no está en estado aceptada o no pertenece a este expediente.';
  end if;

  update public.oferta set estado = 'rechazada' where id = p_oferta_id;
  update public.expediente set estado = 'estimado' where id = p_expediente_id;
  delete from public.contrato where oferta_id = p_oferta_id;
end;
$function$;

notify pgrst, 'reload schema';
