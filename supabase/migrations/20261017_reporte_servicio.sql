-- Servicio en el que se trabajó, en cada parte diario.
--
-- Requiere `20261016_contrato_servicios.sql`.
--
-- Un contrato puede cubrir varios servicios (`contrato.servicio_ids`) y cada
-- servicio tiene sus propias fases y actividades (`fase_servicio`,
-- `actividad_servicio`). Hasta ahora el parte diario solo ofrecía las del
-- servicio principal del expediente. Cada parte indica ahora en qué servicio se
-- trabajó ese día —uno: hay un parte por obra y día— y la fase y las
-- actividades tienen que ser de ese servicio.
--
-- El avance de la obra (`seguimiento_obra.porcentaje_avance`) no cambia: sigue
-- siendo uno para el contrato entero.

-- 1 — Columna.
alter table public.reporte_diario
  add column if not exists servicio_id int references public.servicio(id);

comment on column public.reporte_diario.servicio_id is
  'Servicio del contrato en el que se trabajó ese día. La fase y las actividades del parte son de este servicio.';

-- 2 — Backfill: el servicio de la fase del parte; si no tiene fase, el primero
--     del contrato; en último caso, el principal del expediente.
update public.reporte_diario r
   set servicio_id = coalesce(
         (select f.servicio_id from public.fase_servicio f where f.id = r.fase_id),
         (select c.servicio_ids[1]
            from public.seguimiento_obra s
            join public.contrato c on c.id = s.contrato_id
           where s.id = r.seguimiento_id),
         (select e.servicio_id
            from public.seguimiento_obra s
            join public.expediente e on e.id = s.expediente_id
           where s.id = r.seguimiento_id)
       )
 where r.servicio_id is null;

-- 3 — Validación del parte.
--     · Sin servicio (app antigua): el de la fase, o el primero del contrato.
--     · El servicio tiene que ser del contrato.
--     · La fase, si la hay, tiene que ser de ese servicio.
--     SECURITY DEFINER: solo lee; no depende de las RLS de quien guarda.
create or replace function public.fn_reporte_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrato  int[];
  v_principal int;
  v_fase_srv  int;
begin
  select c.servicio_ids, e.servicio_id
    into v_contrato, v_principal
    from public.seguimiento_obra s
    join public.contrato   c on c.id = s.contrato_id
    join public.expediente e on e.id = s.expediente_id
   where s.id = new.seguimiento_id;

  if new.fase_id is not null then
    select f.servicio_id into v_fase_srv from public.fase_servicio f where f.id = new.fase_id;
  end if;

  if new.servicio_id is null then
    new.servicio_id := coalesce(v_fase_srv, v_contrato[1], v_principal);
  end if;

  if cardinality(coalesce(v_contrato, '{}')) > 0 and new.servicio_id <> all (v_contrato) then
    raise exception 'El servicio del reporte no pertenece al contrato.';
  end if;

  if v_fase_srv is not null and v_fase_srv <> new.servicio_id then
    raise exception 'La fase no pertenece al servicio del reporte.';
  end if;

  return new;
end;
$$;

comment on function public.fn_reporte_servicio() is
  'Asigna y valida reporte_diario.servicio_id: del contrato, y coherente con la fase.';

drop trigger if exists trg_reporte_servicio on public.reporte_diario;

create trigger trg_reporte_servicio
  before insert or update of servicio_id, fase_id on public.reporte_diario
  for each row
  execute function public.fn_reporte_servicio();

-- 4 — Las actividades marcadas también tienen que ser del servicio del parte.
create or replace function public.fn_reporte_actividad_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.reporte_diario r
      join public.actividad_servicio a on a.id = new.actividad_id
     where r.id = new.reporte_id
       and r.servicio_id is not null
       and a.servicio_id <> r.servicio_id
  ) then
    raise exception 'La actividad no pertenece al servicio del reporte.';
  end if;
  return new;
end;
$$;

comment on function public.fn_reporte_actividad_servicio() is
  'Impide marcar en un parte actividades de otro servicio.';

drop trigger if exists trg_reporte_actividad_servicio on public.reporte_actividad;

create trigger trg_reporte_actividad_servicio
  before insert or update of actividad_id, reporte_id on public.reporte_actividad
  for each row
  execute function public.fn_reporte_actividad_servicio();

notify pgrst, 'reload schema';
