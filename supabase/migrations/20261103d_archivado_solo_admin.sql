-- Lo archivado solo lo modifica el administrador.
--
-- Requiere `20261103c_archivar_expediente.sql`.
--
-- Con el expediente en 'archivado', ningún usuario que no sea administrador
-- puede crear, modificar ni borrar el expediente ni nada que cuelgue de él:
--   · expediente, localizacion, estimacion, expediente_servicio,
--     expediente_invitacion, matterport_modelo
--   · oferta, contrato
--   · seguimiento_obra, reporte_diario, reporte_actividad, reporte_zona,
--     inspeccion
--   · archivo (por expediente, estimación, oferta o reporte)
--
-- Un único trigger por tabla lo comprueba antes de cada INSERT, UPDATE o
-- DELETE. Sirve igual para escrituras directas y para RPC SECURITY DEFINER:
-- `auth.uid()` sigue siendo quien llama.
--
-- No aplica a:
--   · el administrador (`mi_rol() = 'administrador'`);
--   · la RPC de archivo (`app.archivo = 'on'`);
--   · llamadas sin usuario (service_role, tareas internas). A anon ya lo
--     frenan las políticas RLS.
--
-- El administrador sigue sujeto a las guardias de `20261103c`: puede editar
-- datos, pero no cambiar estados, crear ofertas o contratos, registrar partes
-- ni mover el avance de la obra mientras el expediente esté archivado.

-- 1 — Expediente al que pertenece una fila de cualquiera de esas tablas.
create or replace function public.fn_expediente_de_fila(p_tabla text, p_fila jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if p_fila is null then
    return null;
  end if;

  case p_tabla
    when 'expediente' then
      return (p_fila->>'id')::uuid;

    when 'localizacion', 'estimacion', 'expediente_servicio', 'expediente_invitacion',
         'matterport_modelo', 'oferta', 'contrato', 'seguimiento_obra' then
      return (p_fila->>'expediente_id')::uuid;

    when 'reporte_diario', 'inspeccion' then
      select s.expediente_id into v_id
        from public.seguimiento_obra s
       where s.id = (p_fila->>'seguimiento_id')::uuid;
      return v_id;

    when 'reporte_actividad', 'reporte_zona' then
      select s.expediente_id into v_id
        from public.reporte_diario r
        join public.seguimiento_obra s on s.id = r.seguimiento_id
       where r.id = (p_fila->>'reporte_id')::uuid;
      return v_id;

    when 'archivo' then
      v_id := (p_fila->>'expediente_id')::uuid;
      if v_id is null and p_fila->>'estimacion_id' is not null then
        select e.expediente_id into v_id
          from public.estimacion e
         where e.id = (p_fila->>'estimacion_id')::uuid;
      end if;
      if v_id is null and p_fila->>'oferta_id' is not null then
        select o.expediente_id into v_id
          from public.oferta o
         where o.id = (p_fila->>'oferta_id')::uuid;
      end if;
      if v_id is null and p_fila->>'reporte_id' is not null then
        select s.expediente_id into v_id
          from public.reporte_diario r
          join public.seguimiento_obra s on s.id = r.seguimiento_id
         where r.id = (p_fila->>'reporte_id')::uuid;
      end if;
      return v_id;

    else
      return null;
  end case;
end;
$function$;

revoke all on function public.fn_expediente_de_fila(text, jsonb) from public, anon, authenticated;

-- 2 — Guardia: fuera del administrador, nadie toca lo archivado.
create or replace function public.fn_guardia_archivado_solo_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_antes   uuid;
  v_despues uuid;
begin
  if coalesce(current_setting('app.archivo', true), '') = 'on'
     or auth.uid() is null
     or public.mi_rol() = 'administrador' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := public.fn_expediente_de_fila(tg_table_name, to_jsonb(old));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_despues := public.fn_expediente_de_fila(tg_table_name, to_jsonb(new));
  end if;

  if exists (
    select 1 from public.expediente e
     where e.id in (v_antes, v_despues)
       and e.estado = 'archivado'
  ) then
    raise exception 'El expediente está archivado: solo un administrador puede modificarlo.';
  end if;

  return coalesce(new, old);
end;
$function$;

-- 3 — Un trigger por tabla. El nombre empieza por «trg_archivado» para que se
-- dispare antes que las guardias de 20261103c (los triggers del mismo evento
-- van en orden alfabético) y el usuario vea este mensaje.
do $$
declare
  t text;
begin
  foreach t in array array[
    'expediente', 'localizacion', 'estimacion', 'expediente_servicio',
    'expediente_invitacion', 'matterport_modelo', 'oferta', 'contrato',
    'seguimiento_obra', 'reporte_diario', 'reporte_actividad', 'reporte_zona',
    'inspeccion', 'archivo'
  ] loop
    execute format('drop trigger if exists trg_archivado_solo_admin on public.%I', t);
    execute format(
      'create trigger trg_archivado_solo_admin
         before insert or update or delete on public.%I
         for each row execute function public.fn_guardia_archivado_solo_admin()', t);
  end loop;
end;
$$;
