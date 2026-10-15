-- Servicios de cada contrato, guardados en el propio contrato.
--
-- Requiere `20261015_oferta_servicios.sql`.
--
-- Un contrato cubre los servicios de la oferta adjudicada (`oferta.servicio_ids`).
-- Hasta ahora las pantallas los leían de la oferta, y eso falla por dos lados:
--   · Permisos: el estimador ve los contratos de los expedientes que estimó,
--     pero no las ofertas (con sus precios). Su lista de seguimiento no podía
--     saber qué servicios tiene cada contrato.
--   · Es un documento firmado: si la oferta se edita después de adjudicar, el
--     contrato no debería cambiar de servicios con ella.
-- Se copian al contrato en el momento de crearlo y ahí se quedan. Quien puede
-- ver el contrato (cliente, constructor, estimador, administrador) ve también
-- sus servicios, sin tocar las RLS de `oferta`.

-- 1 — Columna.
alter table public.contrato
  add column if not exists servicio_ids int[] not null default '{}';

comment on column public.contrato.servicio_ids is
  'Servicios del contrato: copia de oferta.servicio_ids al crearlo (orden del expediente). No sigue a la oferta si esta cambia después.';

-- 2 — Backfill desde la oferta de cada contrato.
update public.contrato c
   set servicio_ids = o.servicio_ids
  from public.oferta o
 where o.id = c.oferta_id
   and cardinality(c.servicio_ids) = 0;

-- 3 — Copia al crear el contrato, venga de donde venga (adjudicar_ofertas,
--     aceptar oferta del cliente…). Si el INSERT ya trae servicios, se respetan.
--     SECURITY DEFINER: quien crea el contrato no siempre puede leer la oferta.
create or replace function public.fn_contrato_servicios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if cardinality(coalesce(new.servicio_ids, '{}')) = 0 then
    select o.servicio_ids
      into new.servicio_ids
      from public.oferta o
     where o.id = new.oferta_id;
    new.servicio_ids := coalesce(new.servicio_ids, '{}');
  end if;
  return new;
end;
$$;

comment on function public.fn_contrato_servicios() is
  'Copia oferta.servicio_ids a contrato.servicio_ids al crear el contrato.';

drop trigger if exists trg_contrato_servicios on public.contrato;

create trigger trg_contrato_servicios
  before insert on public.contrato
  for each row
  execute function public.fn_contrato_servicios();

notify pgrst, 'reload schema';
