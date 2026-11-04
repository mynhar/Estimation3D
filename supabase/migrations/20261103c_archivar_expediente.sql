-- Archivar un expediente: RPC y guardias.
--
-- Requiere `20261103b_estado_archivado.sql` (ya confirmada: usa sus valores de
-- enum) y `20261103_completar_contrato_cierra_obra.sql`.
--
-- archivar_expediente_admin(p_expediente_id), solo administrador, en una
-- transacción:
--   · expediente                        → 'archivado'  (guarda estado_anterior y archivado_en)
--   · ofertas no eliminadas             → 'archivado'  (guarda estado_anterior)
--   · contratos, en cualquier estado    → 'archivado'  (guarda estado_anterior)
--   · seguimientos de obra              → 'pausado'    (guarda estado_anterior)
--
-- Guardias: hay unas veinte funciones que cambian estados (adjudicar, firmar,
-- cancelar, rechazar, eliminar ofertas, reportar…). En vez de tocarlas una a
-- una, unos triggers impiden entrar en 'archivado' o salir de él fuera de esta
-- RPC (y de la futura de desarchivar), y crear ofertas, contratos o partes en
-- un expediente archivado. Cualquier función que lo intente falla entera, sin
-- dejar nada a medias. La RPC se identifica con `app.archivo = 'on'`, un ajuste
-- local a su transacción que PostgREST no deja fijar desde fuera.

-- 1 — Guardia de estado para expediente, oferta y contrato.
create or replace function public.fn_guardia_archivado()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('app.archivo', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado::text = 'archivado' then
      raise exception 'No se puede crear un registro ya archivado.';
    end if;
  elsif new.estado::text is distinct from old.estado::text then
    if old.estado::text = 'archivado' then
      raise exception 'El expediente está archivado: no se puede cambiar el estado de %.', tg_table_name;
    end if;
    if new.estado::text = 'archivado' then
      raise exception 'Para archivar, usa archivar_expediente_admin.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guardia_archivado on public.expediente;
create trigger trg_guardia_archivado
  before insert or update of estado on public.expediente
  for each row execute function public.fn_guardia_archivado();

drop trigger if exists trg_guardia_archivado on public.oferta;
create trigger trg_guardia_archivado
  before insert or update of estado on public.oferta
  for each row execute function public.fn_guardia_archivado();

drop trigger if exists trg_guardia_archivado on public.contrato;
create trigger trg_guardia_archivado
  before insert or update of estado on public.contrato
  for each row execute function public.fn_guardia_archivado();

-- 2 — No se crean ofertas ni contratos en un expediente archivado.
--     SECURITY DEFINER: la RLS podría ocultarle el expediente a un constructor
--     y la guardia lo daría por bueno.
create or replace function public.fn_guardia_expediente_archivado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.expediente e
     where e.id = new.expediente_id
       and e.estado = 'archivado'
  ) then
    raise exception 'El expediente está archivado: los trabajos no se realizarán.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guardia_expediente_archivado on public.oferta;
create trigger trg_guardia_expediente_archivado
  before insert on public.oferta
  for each row execute function public.fn_guardia_expediente_archivado();

drop trigger if exists trg_guardia_expediente_archivado on public.contrato;
create trigger trg_guardia_expediente_archivado
  before insert on public.contrato
  for each row execute function public.fn_guardia_expediente_archivado();

-- 3 — Ni partes nuevos ni cambios en partes de un contrato archivado.
--     Borrar sí se deja (el borrado de un expediente arrastra sus partes);
--     el recálculo de abajo ya no toca una obra archivada.
create or replace function public.fn_guardia_reporte_archivado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1
      from public.seguimiento_obra s
      join public.contrato c on c.id = s.contrato_id
     where s.id = new.seguimiento_id
       and c.estado = 'archivado'
  ) then
    raise exception 'El expediente y el contrato están archivados: la obra está pausada.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guardia_reporte_archivado on public.reporte_diario;
create trigger trg_guardia_reporte_archivado
  before insert or update on public.reporte_diario
  for each row execute function public.fn_guardia_reporte_archivado();

-- 4 — El seguimiento de un contrato archivado no cambia de estado ni de avance
--     (la política seguimiento_update deja escribirlo directamente).
create or replace function public.fn_guardia_seguimiento_archivado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('app.archivo', true), '') = 'on' then
    return new;
  end if;

  if (new.estado is distinct from old.estado
      or new.porcentaje_avance is distinct from old.porcentaje_avance)
     and exists (
       select 1 from public.contrato c
        where c.id = new.contrato_id
          and c.estado = 'archivado'
     ) then
    raise exception 'El expediente y el contrato están archivados: la obra está pausada.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guardia_seguimiento_archivado on public.seguimiento_obra;
create trigger trg_guardia_seguimiento_archivado
  before update on public.seguimiento_obra
  for each row execute function public.fn_guardia_seguimiento_archivado();

-- 5 — recalcular_avance_seguimiento no toca una obra de contrato archivado.
--     Igual que la versión de `20261103_completar_contrato_cierra_obra.sql`,
--     pero lee el contrato antes del bucle y, si está archivado, sale.
create or replace function public.recalcular_avance_seguimiento(p_seguimiento_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_servicios       int[];
  v_contrato_estado estado_contrato;
  v_srv             int;
  v_acum            numeric(5,2) := 0;
  v_global          numeric(5,2) := 0;
  v_row             record;
begin
  -- Servicios del contrato; sin ellos, el principal del expediente.
  select case when cardinality(c.servicio_ids) > 0 then c.servicio_ids
              else array[e.servicio_id] end,
         c.estado
    into v_servicios, v_contrato_estado
    from seguimiento_obra s
    join contrato   c on c.id = s.contrato_id
    join expediente e on e.id = s.expediente_id
   where s.id = p_seguimiento_id;

  -- Contrato archivado: la obra está pausada y se queda como está.
  if v_contrato_estado = 'archivado' then
    return;
  end if;

  -- Acumulado de cada parte, dentro de su servicio y en orden de fecha.
  for v_row in
    select id, servicio_id, porcentaje_avance_dia
      from reporte_diario
     where seguimiento_id = p_seguimiento_id
     order by servicio_id, fecha asc, creado_en asc, id asc
  loop
    if v_row.servicio_id is distinct from v_srv then
      v_srv  := v_row.servicio_id;
      v_acum := 0;
    end if;
    v_acum := least(v_acum + v_row.porcentaje_avance_dia, 100);
    update reporte_diario
       set porcentaje_acumulado = v_acum
     where id = v_row.id;
  end loop;

  -- Global: media del avance de cada servicio (un servicio sin partes cuenta 0).
  select coalesce(avg(least(coalesce(t.total, 0), 100)), 0)
    into v_global
    from unnest(coalesce(v_servicios, '{}')) as x(servicio_id)
    left join (
      select servicio_id, sum(porcentaje_avance_dia) as total
        from reporte_diario
       where seguimiento_id = p_seguimiento_id
       group by servicio_id
    ) t on t.servicio_id = x.servicio_id;

  -- Contrato completado: la obra la cerró el administrador al 100 %
  -- (completar_contrato_admin) y borrar o corregir un parte no la reabre.
  if v_contrato_estado = 'completado' then
    v_global := 100;
  end if;

  -- El estado sale del avance en los dos sentidos: al 100 % se completa y, si
  -- vuelve a bajar (se borra un parte, o con esta regla un servicio sigue sin
  -- avanzar), deja de estarlo. Fuera de esta función, solo
  -- completar_contrato_admin lo marca.
  update seguimiento_obra
     set porcentaje_avance = v_global,
         estado            = case
                               when v_global >= 100     then 'completado'::estado_seguimiento
                               when estado = 'completado' then 'en_progreso'::estado_seguimiento
                               else estado
                             end,
         fecha_fin_real    = case
                               when v_global >= 100 and fecha_fin_real is null then now()
                               when v_global < 100  then null
                               else fecha_fin_real
                             end,
         actualizado_en    = now()
   where id = p_seguimiento_id;
end;
$function$;

-- 6 — La RPC.
create or replace function public.archivar_expediente_admin(p_expediente_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rol    text;
  v_estado estado_expediente;
begin
  select rol into v_rol
    from public.perfil
   where id = auth.uid();

  if v_rol is distinct from 'administrador' then
    raise exception 'No autorizado: se requiere rol administrador.';
  end if;

  select estado into v_estado
    from public.expediente
   where id = p_expediente_id
   for update;

  if not found then
    raise exception 'Expediente no encontrado.';
  end if;

  if v_estado = 'archivado' then
    raise exception 'El expediente ya está archivado.';
  end if;

  perform set_config('app.archivo', 'on', true);

  -- Obras: pausadas. Primero, mientras sus contratos aún no están archivados.
  update public.seguimiento_obra
     set estado_anterior = estado,
         estado          = 'pausado'
   where expediente_id = p_expediente_id;

  -- Contratos: todos, también los completados y cancelados.
  update public.contrato
     set estado_anterior = estado,
         estado          = 'archivado',
         actualizado_en  = now()
   where expediente_id = p_expediente_id;

  -- Ofertas: las no eliminadas.
  update public.oferta
     set estado_anterior = estado,
         estado          = 'archivado',
         actualizado_en  = now()
   where expediente_id = p_expediente_id
     and eliminada_en is null;

  update public.expediente
     set estado_anterior = estado,
         estado          = 'archivado',
         archivado_en    = now(),
         actualizado_en  = now()
   where id = p_expediente_id;

  perform set_config('app.archivo', '', true);
end;
$function$;

revoke all on function public.archivar_expediente_admin(uuid) from public, anon;
grant execute on function public.archivar_expediente_admin(uuid) to authenticated, service_role;
