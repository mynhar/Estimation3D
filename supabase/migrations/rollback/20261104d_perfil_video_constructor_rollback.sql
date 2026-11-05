-- Rollback de 20261104d_perfil_video_constructor.sql
--
-- El constructor deja de escribir sus videos. Los que ya haya creado se
-- conservan (siguen ligados a su perfil y el administrador los gestiona desde
-- /admin/user/edit).

drop policy if exists perfil_video_insert_constructor on public.perfil_video;
drop policy if exists perfil_video_update_constructor on public.perfil_video;
drop policy if exists perfil_video_delete_constructor on public.perfil_video;

drop policy if exists "presentaciones_insert_constructor" on storage.objects;
drop policy if exists "presentaciones_update_constructor" on storage.objects;
drop policy if exists "presentaciones_delete_constructor" on storage.objects;
