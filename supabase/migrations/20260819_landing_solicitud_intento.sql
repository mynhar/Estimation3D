-- Límite de tasa del formulario público de la landing.
--
-- `crear-dossier-landing` es el único endpoint que se llama sin sesión: basta
-- la clave anónima, que va en el bundle del navegador. Sin freno, cualquiera
-- puede darle en bucle y crear usuarios de verdad y disparar correos de verdad
-- desde nuestro dominio — spam, y la reputación del remitente por el suelo.
--
-- El freno necesita memoria entre invocaciones, y una edge function no la tiene
-- (cada llamada puede caer en otra instancia). Va en la base: una fila por
-- intento aceptado, y la función cuenta las de la ventana antes de trabajar.

create table if not exists public.landing_solicitud_intento (
  id        bigint generated always as identity primary key,
  -- Texto y no `inet`: llega de la cabecera `x-forwarded-for`, que puede venir
  -- vacía o con basura. Nunca debe hacer fallar el alta por un cast.
  ip        text,
  email     text not null,
  creado_en timestamptz not null default now()
);

comment on table public.landing_solicitud_intento is
  'Bitácora de intentos del formulario público de la landing. Solo la usa la edge function crear-dossier-landing (service role) para limitar por IP y por correo. Se purga sola a los 7 días.';

-- Los dos índices son las dos preguntas que hace la función: cuántos intentos
-- lleva este correo, y cuántos esta IP.
create index if not exists landing_solicitud_intento_email_idx
  on public.landing_solicitud_intento (email, creado_en desc);
create index if not exists landing_solicitud_intento_ip_idx
  on public.landing_solicitud_intento (ip, creado_en desc);
-- Para la purga periódica.
create index if not exists landing_solicitud_intento_creado_en_idx
  on public.landing_solicitud_intento (creado_en);

-- RLS activa y SIN políticas: nadie llega a esta tabla por PostgREST. Solo el
-- service role, que la salta. Son direcciones IP — dato personal — y no hay una
-- sola pantalla que las necesite.
alter table public.landing_solicitud_intento enable row level security;

revoke all on public.landing_solicitud_intento from anon, authenticated;
