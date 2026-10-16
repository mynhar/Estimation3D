-- El cliente no puede cancelar un contrato cuyo trabajo ya está hecho.
--
-- Requiere `20260925d_cancelar_contrato_cliente_por_contrato.sql`.
--
-- /client/contracts ya desactiva «Cancelar contrato» cuando la obra está al
-- 100 % (seguimiento_obra.estado = 'completado'), pero la función seguía
-- aceptándolo si se la llamaba directamente. También aceptaba cancelar un
-- contrato 'completado', que la pantalla nunca ofrece. La base es quien manda:
--
--   · contrato 'completado'                    → no se cancela.
--   · obra al 100 % (seguimiento 'completado')  → no se cancela.
--
-- Mismo criterio que la insignia «Obra terminada al 100 %» de las listas. El
-- resto de la función no cambia.

create or replace function public.cancelar_contrato_cliente(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expediente_id uuid;
  v_oferta_id     uuid;
  v_estado        text;
  v_oferta        public.oferta%rowtype;
  v_activos       integer;
  v_vivas         integer;
begin
  select c.expediente_id, c.oferta_id, c.estado
    into v_expediente_id, v_oferta_id, v_estado
  from public.contrato c
  where c.id = p_contrato_id
    and c.cliente_id = auth.uid();

  if not found then
    raise exception 'No autorizado: el contrato no existe o no le pertenece.';
  end if;

  if v_estado = 'cancelado' then
    raise exception 'El contrato ya está cancelado.';
  end if;

  -- El trabajo ya está hecho: ni contrato completado ni obra al 100 %.
  if v_estado = 'completado' then
    raise exception 'El contrato ya está completado: no se puede cancelar.';
  end if;

  if exists (
    select 1 from public.seguimiento_obra s
    where s.contrato_id = p_contrato_id
      and s.estado = 'completado'
  ) then
    raise exception 'La obra de este contrato está terminada al 100 %%: no se puede cancelar.';
  end if;

  update public.contrato
  set estado         = 'cancelado',
      actualizado_en = now()
  where id = p_contrato_id;

  select * into v_oferta from public.oferta where id = v_oferta_id;

  if found and v_oferta.estado <> 'rechazada' then
    insert into public.oferta_auditoria (oferta_id, expediente_id, accion, actor_id, snapshot)
    values (v_oferta_id, v_expediente_id, 'rechazada', auth.uid(), to_jsonb(v_oferta));

    update public.oferta set estado = 'rechazada' where id = v_oferta_id;
  end if;

  select count(*) into v_activos
  from public.contrato
  where expediente_id = v_expediente_id
    and estado in ('generado', 'firmado', 'en_ejecucion');

  if v_activos = 0 then
    select count(*) into v_vivas
    from public.oferta
    where expediente_id = v_expediente_id
      and eliminada_en is null
      and estado <> 'rechazada';

    update public.expediente
    set estado = case when v_vivas > 0 then 'en_oferta' else 'estimado' end::estado_expediente
    where id = v_expediente_id;
  end if;
end;
$function$;

comment on function public.cancelar_contrato_cliente(uuid) is
  'El cliente cancela uno de sus contratos. No si está completado ni si la obra está al 100 %.';

notify pgrst, 'reload schema';
