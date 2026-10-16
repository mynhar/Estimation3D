-- El cliente puede aceptar varias ofertas a la vez (un contrato por oferta).
--
-- Requiere `20260925b_adjudicar_multiples_ofertas.sql`.
--
-- En un expediente con varios servicios, el cliente elige en /client/builder-offer
-- una oferta para todos los servicios, una para cada servicio o varias para el
-- mismo servicio. `aceptar_oferta` (la que usaba) solo admite una: rechaza las
-- demás y deja un único contrato, así que llamarla varias veces deshace la
-- anterior. `adjudicar_ofertas` ya hace exactamente lo necesario —atómico, un
-- contrato por oferta, auditoría y bloqueo si hay contratos firmados— pero solo
-- la podían llamar administrador y estimador.
--
-- 1 — adjudicar_ofertas: además de administrador / estimador, el cliente dueño
--     del expediente. La lógica no cambia.
-- 2 — rechazar_oferta (la del cliente con una oferta aceptada):
--     · Con varias aceptadas, rechazar una ya no devuelve el expediente a
--       'estimado' si quedan otras aceptadas.
--     · No borra un contrato firmado, en ejecución o completado (antes sí: el
--       DELETE por oferta no miraba el estado). Para esos está la cancelación.

-- 1 — adjudicar_ofertas ------------------------------------------------------
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

  -- Administrador / estimador, o el cliente del expediente. Un único mensaje
  -- para «no existe» y «no es tuyo»: no se revela si el expediente existe.
  select estado, cliente_id into v_estado, v_cliente_id
  from public.expediente
  where id = p_expediente_id
    and (cliente_id = auth.uid() or v_rol in ('administrador', 'estimador'));

  if not found then
    raise exception 'No autorizado: el expediente no existe o no le pertenece.';
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

comment on function public.adjudicar_ofertas(uuid, uuid[]) is
  'Adjudica varias ofertas (un contrato por oferta), atómico. Administrador, estimador o el cliente del expediente.';

-- 2 — rechazar_oferta --------------------------------------------------------
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

  -- Un contrato firmado no se borra rechazando la oferta: se cancela.
  if exists (
    select 1 from public.contrato
    where oferta_id = p_oferta_id
      and estado in ('firmado', 'en_ejecucion', 'completado')
  ) then
    raise exception 'El contrato de esta oferta ya está firmado. Cancélalo desde Contratos.';
  end if;

  update public.oferta set estado = 'rechazada' where id = p_oferta_id;
  delete from public.contrato where oferta_id = p_oferta_id;

  -- El expediente solo vuelve a 'estimado' si ya no queda ninguna aceptada.
  if not exists (
    select 1 from public.oferta
    where expediente_id = p_expediente_id
      and estado = 'aceptada'
      and eliminada_en is null
  ) then
    update public.expediente set estado = 'estimado' where id = p_expediente_id;
  end if;
end;
$function$;

notify pgrst, 'reload schema';
