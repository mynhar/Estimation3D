-- Rollback de 20260812_perfil_idioma.sql
--
-- ATENCIÓN: destruye el idioma registrado de cada usuario. Los correos
-- volverán a enviarse en el idioma por defecto (fr) para todo el mundo.

alter table public.perfil drop constraint if exists perfil_idioma_check;
alter table public.perfil drop column     if exists idioma;

notify pgrst, 'reload schema';
