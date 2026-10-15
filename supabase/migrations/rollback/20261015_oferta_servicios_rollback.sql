-- Rollback de `20261015_oferta_servicios.sql`.
--
-- Atención: se pierde qué servicios cubre cada oferta; todas vuelven a
-- entenderse como «el expediente entero». Las dos funciones vuelven a su
-- versión de 20261014 / 20261014b.

drop trigger  if exists trg_oferta_servicios on public.oferta;
drop function if exists public.fn_oferta_servicios();
alter table public.oferta drop column if exists servicio_ids;

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

notify pgrst, 'reload schema';
