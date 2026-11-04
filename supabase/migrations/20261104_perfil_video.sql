-- Videos de presentación del estimador y del constructor.
--
-- Un video corto en el que el profesional se presenta. Lo graba (pantalla,
-- cámara o ambas) o lo sube el administrador desde /admin/user/edit/:id, y
-- queda ligado al perfil. Un perfil puede tener varios.
--
-- · Tabla `perfil_video`: metadatos (título, duración, tamaño, vistas…).
-- · Bucket privado `presentaciones`: el archivo y su miniatura, en
--   `<perfil_id>/<video_id>.<ext>` y `<perfil_id>/<video_id>.jpg`. Privado
--   porque es la cara de una persona: se sirve con URL firmadas.
-- · RPC `registrar_vista_perfil_video`: suma una vista sin abrir el UPDATE
--   de la tabla a quien no es administrador.
--
-- Escritura: sólo el administrador. Lectura: el administrador y el dueño.
-- Requiere `public.mi_rol()`.

-- 1 — Bucket ------------------------------------------------------------------
-- 50 MB: el límite global de subida del plan. El grabador corta a los 3 min a
-- ~2 Mb/s, así que una grabación cabe con margen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'presentaciones', 'presentaciones', false, 52428800,
  array['video/webm', 'video/mp4', 'video/quicktime', 'image/jpeg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2 — Tabla -------------------------------------------------------------------
create table if not exists public.perfil_video (
  id              uuid        primary key default gen_random_uuid(),
  perfil_id       uuid        not null references public.perfil(id) on delete cascade,
  titulo          text        not null check (char_length(btrim(titulo)) between 1 and 120),
  video_path      text        not null unique,
  miniatura_path  text,
  mime_type       text        not null,
  tamano_bytes    bigint      not null check (tamano_bytes > 0),
  duracion_ms     integer     not null default 0 check (duracion_ms >= 0),
  ancho           integer     check (ancho > 0),
  alto            integer     check (alto > 0),
  -- 'grabacion' = hecho con el grabador de la app; 'subida' = archivo propio.
  origen          text        not null check (origen in ('grabacion', 'subida')),
  -- Qué se grabó. Nulo en los subidos: no se sabe.
  modo            text        check (modo in ('pantalla_camara', 'pantalla', 'camara')),
  vistas          integer     not null default 0 check (vistas >= 0),
  creado_por      uuid        default auth.uid() references public.perfil(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.perfil_video is
  'Videos de presentación de estimadores y constructores. Archivo en el bucket privado presentaciones.';

create index if not exists perfil_video_perfil_idx
  on public.perfil_video (perfil_id, creado_en desc);

-- 3 — Integridad --------------------------------------------------------------
-- Sólo el estimador y el constructor se presentan con video. Se comprueba al
-- crear (y si alguien moviera el video a otro perfil); un cambio de rol
-- posterior no borra lo que ya hay.
create or replace function public.fn_perfil_video_guardar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rol public.rol_usuario;
begin
  if tg_op = 'INSERT' or new.perfil_id is distinct from old.perfil_id then
    select rol into v_rol from public.perfil where id = new.perfil_id;
    if v_rol is null or v_rol not in ('estimador', 'constructor') then
      raise exception 'perfil_video: solo estimadores y constructores tienen videos de presentación'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Una vista no es una edición: sólo el título mueve `actualizado_en`.
  if tg_op = 'UPDATE' and new.titulo is distinct from old.titulo then
    new.actualizado_en := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_perfil_video_guardar on public.perfil_video;
create trigger trg_perfil_video_guardar
  before insert or update on public.perfil_video
  for each row execute function public.fn_perfil_video_guardar();

-- 4 — RLS de la tabla ---------------------------------------------------------
alter table public.perfil_video enable row level security;

drop policy if exists perfil_video_select on public.perfil_video;
create policy perfil_video_select on public.perfil_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or perfil_id = auth.uid());

drop policy if exists perfil_video_insert_admin on public.perfil_video;
create policy perfil_video_insert_admin on public.perfil_video
  for insert to authenticated
  with check (public.mi_rol() = 'administrador');

drop policy if exists perfil_video_update_admin on public.perfil_video;
create policy perfil_video_update_admin on public.perfil_video
  for update to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

drop policy if exists perfil_video_delete_admin on public.perfil_video;
create policy perfil_video_delete_admin on public.perfil_video
  for delete to authenticated
  using (public.mi_rol() = 'administrador');

revoke all on public.perfil_video from anon;
grant select, insert, update, delete on public.perfil_video to authenticated;

-- 5 — Contador de vistas ------------------------------------------------------
-- Suma una vista a un video que quien llama puede ver, y devuelve el total.
-- Nulo si el video no existe o no es suyo.
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

revoke execute on function public.registrar_vista_perfil_video(uuid) from public;
revoke execute on function public.registrar_vista_perfil_video(uuid) from anon;
grant  execute on function public.registrar_vista_perfil_video(uuid) to authenticated;

-- 6 — Storage: bucket `presentaciones` ----------------------------------------
-- La primera carpeta del nombre es el perfil dueño.
drop policy if exists "presentaciones_select" on storage.objects;
create policy "presentaciones_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'presentaciones'
    and (
      public.mi_rol() = 'administrador'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "presentaciones_insert_admin" on storage.objects;
create policy "presentaciones_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'presentaciones' and public.mi_rol() = 'administrador');

drop policy if exists "presentaciones_update_admin" on storage.objects;
create policy "presentaciones_update_admin" on storage.objects
  for update to authenticated
  using      (bucket_id = 'presentaciones' and public.mi_rol() = 'administrador')
  with check (bucket_id = 'presentaciones' and public.mi_rol() = 'administrador');

drop policy if exists "presentaciones_delete_admin" on storage.objects;
create policy "presentaciones_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'presentaciones' and public.mi_rol() = 'administrador');
