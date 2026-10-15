-- Varios tipos de servicio por expediente.
--
-- Las altas y ediciones de expediente (administrador, estimador y cliente)
-- dejan marcar uno, varios o todos los servicios para un mismo expediente: una
-- sola visita y una sola dirección, con varios trabajos. `expediente.servicio_id` es escalar y NOT
-- NULL, y de él cuelgan las fases y actividades de la estimación, el
-- seguimiento de obra, los listados y la vista de búsqueda. Por eso la lista
-- va en su propia tabla — mismo patrón que `perfil_especialidad` — y la
-- columna no cambia de significado:
--
--   · `expediente.servicio_id` = servicio PRINCIPAL (el primero marcado).
--     Todo lo que ya existe lo sigue leyendo sin cambios.
--   · `expediente_servicio`    = la lista COMPLETA, principal incluido.
--
-- La invariante «el principal siempre está en la lista» la mantiene la base
-- (trigger del punto 3), no cada pantalla: el alta pública de la landing sigue
-- enviando un solo `servicio_id` y obtiene su fila igual.

-- 1 — Tabla.
create table if not exists public.expediente_servicio (
  expediente_id uuid        not null references public.expediente(id) on delete cascade,
  servicio_id   int         not null references public.servicio(id),
  creado_en     timestamptz not null default now(),
  primary key (expediente_id, servicio_id)
);

comment on table public.expediente_servicio is
  'Tipos de servicio de un expediente. Lista completa, incluido el principal (expediente.servicio_id), que un trigger mantiene siempre presente.';

-- La clave primaria sirve a «¿qué servicios tiene este expediente?»; este
-- índice, a la inversa: «¿qué expedientes piden este servicio?».
create index if not exists expediente_servicio_servicio_idx
  on public.expediente_servicio (servicio_id);

-- 2 — Backfill: los expedientes existentes tienen exactamente un servicio.
insert into public.expediente_servicio (expediente_id, servicio_id)
select id, servicio_id from public.expediente
on conflict do nothing;

-- 3 — El principal siempre en la lista.
--     INSERT: se añade la fila del principal.
--     UPDATE directo de servicio_id (fuera de `guardar_servicios_expediente`):
--     el principal anterior se sustituye por el nuevo; los demás servicios de
--     la lista se conservan.
--     SECURITY DEFINER para que el alta de un cliente no necesite permiso de
--     escritura directo sobre esta tabla.
create or replace function public.fn_expediente_servicio_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.servicio_id is not distinct from old.servicio_id then
      return new;
    end if;
    delete from public.expediente_servicio
     where expediente_id = old.id and servicio_id = old.servicio_id;
  end if;

  insert into public.expediente_servicio (expediente_id, servicio_id)
  values (new.id, new.servicio_id)
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.fn_expediente_servicio_principal() is
  'Mantiene expediente.servicio_id dentro de expediente_servicio en cada alta y cambio de servicio principal.';

drop trigger if exists trg_expediente_servicio_principal on public.expediente;

create trigger trg_expediente_servicio_principal
  after insert or update of servicio_id on public.expediente
  for each row
  execute function public.fn_expediente_servicio_principal();

-- 4 — RLS.
alter table public.expediente_servicio enable row level security;

-- Lectura: quien puede ver el expediente ve sus servicios. La subconsulta
-- corre con las RLS de `expediente`, así que esta política hereda sus reglas
-- (que han cambiado varias veces) en vez de copiarlas.
drop policy if exists expediente_servicio_select on public.expediente_servicio;
create policy expediente_servicio_select
  on public.expediente_servicio for select to authenticated
  using (
    exists (select 1 from public.expediente e where e.id = expediente_id)
  );

-- Escritura: los mismos roles que pueden crear un expediente
-- (`expediente_insert`), y solo sobre expedientes que ven.
drop policy if exists expediente_servicio_insert on public.expediente_servicio;
create policy expediente_servicio_insert
  on public.expediente_servicio for insert to authenticated
  with check (
    exists (
      select 1 from public.expediente e
       where e.id = expediente_id
         and (
           mi_rol() = any (array['estimador'::rol_usuario, 'administrador'::rol_usuario])
           or (mi_rol() = 'cliente'::rol_usuario and e.cliente_id = auth.uid())
         )
    )
  );

revoke all on public.expediente_servicio from anon;

notify pgrst, 'reload schema';
