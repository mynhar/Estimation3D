-- Dirección personal del usuario (sección «Datos personales» en el alta de
-- usuarios del panel admin).
--
-- Mismo criterio que `20260716_perfil_datos_compania.sql`: son campos planos
-- ligados a una sola persona, sin necesidad de compartirse ni de historial, así
-- que van en `perfil` y no en una tabla aparte.
--
-- Direcciones canadienses: unidad + número y nombre de calle + ciudad +
-- provincia/territorio (código de dos letras) + código postal. Todas nullable:
-- los cinco campos son opcionales en el formulario.

alter table public.perfil
  add column if not exists direccion_unidad        text,
  add column if not exists direccion_calle         text,
  add column if not exists direccion_ciudad        text,
  add column if not exists direccion_provincia     text,
  add column if not exists direccion_codigo_postal text;

comment on column public.perfil.direccion_unidad        is 'Dirección personal: número de unidad / apartamento (opcional).';
comment on column public.perfil.direccion_calle         is 'Dirección personal: número y nombre de calle (opcional).';
comment on column public.perfil.direccion_ciudad        is 'Dirección personal: ciudad (opcional).';
comment on column public.perfil.direccion_provincia     is 'Dirección personal: código de provincia/territorio canadiense, p. ej. QC (opcional).';
comment on column public.perfil.direccion_codigo_postal is 'Dirección personal: código postal canadiense, formato A1A 1A1 (opcional).';

-- Las RLS de `perfil` son a nivel de fila: las columnas nuevas quedan cubiertas
-- por las políticas existentes sin cambios.

notify pgrst, 'reload schema';
