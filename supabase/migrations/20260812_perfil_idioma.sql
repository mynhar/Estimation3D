-- ============================================================
-- perfil.idioma — idioma que el usuario tiene seleccionado en la aplicación
--
-- Hasta ahora el idioma vivía sólo en `localStorage` del navegador
-- (LangService), así que el servidor no tenía forma de saber en qué idioma
-- escribirle a un usuario. Esta columna lo persiste para que las edge
-- functions que envían correo (enviar-credenciales) puedan redactarlos en
-- el idioma correcto.
--
-- Por defecto 'fr': es el idioma por defecto de la aplicación.
-- ============================================================

alter table public.perfil
  add column if not exists idioma text not null default 'fr';

alter table public.perfil
  drop constraint if exists perfil_idioma_check;

alter table public.perfil
  add constraint perfil_idioma_check check (idioma in ('fr', 'en', 'es'));

comment on column public.perfil.idioma is
  'Idioma seleccionado por el usuario en la aplicación (fr | en | es). Lo escribe LangService.set() y lo usan las edge functions de correo.';

notify pgrst, 'reload schema';
