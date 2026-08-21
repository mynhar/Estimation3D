-- Especialidades declaradas por el constructor en el formulario público
-- «Devenir entrepreneur partenaire».
--
-- `perfil.especialidad_id` guarda UNA especialidad: es lo que pide el alta del
-- panel de administración, donde el administrador elige un solo tipo de
-- servicio. El formulario público es distinto — el candidato marca todas las
-- que hace — y meter esa lista en la columna escalar significaría tirar datos
-- en silencio. Por eso la lista va en su propia tabla.
--
-- Convivencia con las columnas de `perfil`, que no cambian de significado:
--   · `especialidad_todas` = true  → cubre todo; esta tabla queda vacía.
--   · una sola especialidad marcada → se copia también a `especialidad_id`,
--     para que la pantalla de edición del administrador la muestre.
--   · varias marcadas → `especialidad_id` queda NULL (no hay forma honesta de
--     elegir una) y la respuesta completa vive aquí.

create table if not exists public.perfil_especialidad (
  perfil_id   uuid        not null references public.perfil(id)   on delete cascade,
  servicio_id int         not null references public.servicio(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (perfil_id, servicio_id)
);

comment on table public.perfil_especialidad is
  'Constructor: tipos de servicio que declara ofrecer. Lista completa; complementa a perfil.especialidad_id (una sola) y perfil.especialidad_todas (todas).';

-- La pregunta habitual es la inversa —«¿qué constructores hacen este
-- servicio?»—, y la clave primaria solo sirve a la directa.
create index if not exists perfil_especialidad_servicio_idx
  on public.perfil_especialidad (servicio_id);

alter table public.perfil_especialidad enable row level security;

-- Lectura: el propio constructor y los roles internos. Nadie escribe desde
-- PostgREST: las filas las pone la edge function `crear-constructor-landing`
-- con service role, igual que el resto del alta pública.
drop policy if exists perfil_especialidad_select on public.perfil_especialidad;
create policy perfil_especialidad_select
  on public.perfil_especialidad for select to authenticated
  using (
    perfil_id = auth.uid()
    or mi_rol() in ('estimador'::rol_usuario, 'administrador'::rol_usuario)
  );

revoke all on public.perfil_especialidad from anon;

notify pgrst, 'reload schema';
