-- Desarchivar un expediente: deshace `archivar_expediente_admin`.
--
-- Requiere `20261103c_archivar_expediente.sql` y `20261103d_archivado_solo_admin.sql`.
--
-- desarchivar_expediente_admin(p_expediente_id), solo administrador, en una
-- transacción. Cada registro vuelve al estado que guardó al archivarse:
--   · expediente           'archivado' → estado_anterior   (borra archivado_en)
--   · ofertas              'archivado' → estado_anterior
--   · contratos            'archivado' → estado_anterior
--   · seguimientos de obra 'pausado'   → estado_anterior
-- y estado_anterior vuelve a NULL en todos.
--
-- Mientras estuvo archivado nada pudo cambiar de estado ni crearse (guardias de
-- 20261103c/d), así que restaurar los estados guardados devuelve el expediente
-- tal como estaba. El avance de las obras no se recalcula: los partes no se
-- pudieron tocar.
--
-- Usa `app.archivo = 'on'`, igual que archivar, para pasar las guardias.
-- `trg_contrato_seguimiento` salta al volver un contrato a 'firmado', pero
-- inserta con `on conflict (contrato_id) do nothing`: no duplica la obra.

create or replace function public.desarchivar_expediente_admin(p_expediente_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rol      text;
  v_estado   estado_expediente;
  v_anterior estado_expediente;
begin
  select rol into v_rol
    from public.perfil
   where id = auth.uid();

  if v_rol is distinct from 'administrador' then
    raise exception 'No autorizado: se requiere rol administrador.';
  end if;

  select estado, estado_anterior into v_estado, v_anterior
    from public.expediente
   where id = p_expediente_id
   for update;

  if not found then
    raise exception 'Expediente no encontrado.';
  end if;

  if v_estado is distinct from 'archivado' then
    raise exception 'El expediente no está archivado.';
  end if;

  -- Sin estado anterior no hay a dónde volver: mejor fallar que inventarlo.
  if v_anterior is null
     or exists (select 1 from public.oferta
                 where expediente_id = p_expediente_id
                   and estado = 'archivado' and estado_anterior is null)
     or exists (select 1 from public.contrato
                 where expediente_id = p_expediente_id
                   and estado = 'archivado' and estado_anterior is null) then
    raise exception 'Falta el estado anterior del expediente, de una oferta o de un contrato: no se puede desarchivar.';
  end if;

  perform set_config('app.archivo', 'on', true);

  -- Primero el expediente: así, al volver los contratos, ya no está archivado.
  update public.expediente
     set estado          = estado_anterior,
         estado_anterior = null,
         archivado_en    = null,
         actualizado_en  = now()
   where id = p_expediente_id;

  update public.contrato
     set estado          = estado_anterior,
         estado_anterior = null,
         actualizado_en  = now()
   where expediente_id = p_expediente_id
     and estado = 'archivado';

  update public.oferta
     set estado          = estado_anterior,
         estado_anterior = null,
         actualizado_en  = now()
   where expediente_id = p_expediente_id
     and estado = 'archivado';

  -- Obras: las que pausó el archivo (son las que guardaron estado_anterior).
  update public.seguimiento_obra
     set estado          = estado_anterior,
         estado_anterior = null
   where expediente_id = p_expediente_id
     and estado_anterior is not null;

  perform set_config('app.archivo', '', true);
end;
$function$;

revoke all on function public.desarchivar_expediente_admin(uuid) from public, anon;
grant execute on function public.desarchivar_expediente_admin(uuid) to authenticated, service_role;
