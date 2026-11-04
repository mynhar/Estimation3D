-- Deshace 20261104_perfil_video.sql.
--
-- OJO: borra los metadatos de todos los videos de presentación. Antes, vaciar
-- el bucket `presentaciones` desde el panel de Storage (o la API): Supabase no
-- deja borrar un bucket con objetos.

drop policy if exists "presentaciones_select"       on storage.objects;
drop policy if exists "presentaciones_insert_admin" on storage.objects;
drop policy if exists "presentaciones_update_admin" on storage.objects;
drop policy if exists "presentaciones_delete_admin" on storage.objects;

drop function if exists public.registrar_vista_perfil_video(uuid);

drop table if exists public.perfil_video;
drop function if exists public.fn_perfil_video_guardar();

delete from storage.buckets where id = 'presentaciones';
