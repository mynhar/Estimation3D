-- Rollback de 20261104b_perfil_video_estimador.sql
--
-- Vuelve a «escribe sólo el administrador». Los videos que ya hayan creado
-- los estimadores se conservan (siguen ligados a su perfil y el administrador
-- los gestiona desde /admin/user/edit).

-- 1 — Tabla -------------------------------------------------------------------
drop policy if exists perfil_video_insert_estimador on public.perfil_video;
drop policy if exists perfil_video_update_estimador on public.perfil_video;
drop policy if exists perfil_video_delete_estimador on public.perfil_video;

revoke update (titulo) on public.perfil_video from authenticated;
grant  update on public.perfil_video to authenticated;

-- 2 — Vistas: el administrador y el dueño suman ---------------------------------
create or replace function public.registrar_vista_perfil_video(p_video_id uuid)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.perfil_video
     set vistas = vistas + 1
   where id = p_video_id
     and (public.mi_rol() = 'administrador' or perfil_id = auth.uid())
  returning vistas;
$function$;

-- 3 — Storage -----------------------------------------------------------------
drop policy if exists "presentaciones_insert_estimador" on storage.objects;
drop policy if exists "presentaciones_update_estimador" on storage.objects;
drop policy if exists "presentaciones_delete_estimador" on storage.objects;
