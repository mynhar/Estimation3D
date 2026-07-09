-- ============================================================================
-- Asistente IA: fuentes de verdad de referencia + eventos de escalación.
--   · ficha_normativa      → fichas normativas de Quebec (referencia global)
--   · imprevisto_catalogo  → catálogo de imprevistos documentados por servicio
--   · asistente_evento     → eventos internos que emite el asistente (tool use)
-- Trilingüe FR/EN/ES, misma convención que servicio/fase_servicio.
-- Aplicada vía MCP el 2026-07-08 (proyecto ckdksfvxjimxuqceoeyr).
-- ============================================================================

-- ── Fichas normativas (referencia global) ──────────────────────────────────
create table public.ficha_normativa (
  id          serial primary key,
  codigo      text not null unique,
  titulo_fr   text not null,
  titulo_en   text not null,
  titulo_es   text not null,
  resumen_fr  text not null,
  resumen_en  text not null,
  resumen_es  text not null,
  palabras_clave text[] not null default '{}',
  activo      boolean not null default true,
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);
comment on table public.ficha_normativa is 'Fichas normativas de Quebec provistas como fuente de verdad al Asistente IA.';

-- ── Catálogo de imprevistos por servicio ───────────────────────────────────
create table public.imprevisto_catalogo (
  id            serial primary key,
  servicio_id   integer references public.servicio(id) on delete cascade,
  codigo        text not null unique,
  titulo_fr     text not null,
  titulo_en     text not null,
  titulo_es     text not null,
  perfil_fr     text not null,
  perfil_en     text not null,
  perfil_es     text not null,
  protocolo_fr  text not null,
  protocolo_en  text not null,
  protocolo_es  text not null,
  requiere_aprobacion boolean not null default true,
  ficha_codigo  text references public.ficha_normativa(codigo) on delete set null,
  activo        boolean not null default true,
  orden         integer not null default 0,
  creado_en     timestamptz not null default now()
);
comment on table public.imprevisto_catalogo is 'Imprevistos documentados por tipo de servicio (servicio_id NULL = aplica a todos).';
create index imprevisto_catalogo_servicio_idx on public.imprevisto_catalogo(servicio_id);

-- ── Eventos de escalación emitidos por el asistente ────────────────────────
create table public.asistente_evento (
  id            uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references public.expediente(id) on delete cascade,
  usuario_id    uuid not null references public.perfil(id) on delete cascade,
  rol           rol_usuario not null,
  tipo          text not null check (tipo in (
                  'salud_mencionada',
                  'escalada_humana',
                  'caso_externo',
                  'evidencia_incompleta_imprevisto',
                  'imprevisto_anticipado')),
  resumen       text not null,
  payload       jsonb not null default '{}'::jsonb,
  resuelto      boolean not null default false,
  creado_en     timestamptz not null default now()
);
comment on table public.asistente_evento is 'Eventos internos de escalación/seguimiento que el Asistente IA registra vía tool use. No visibles para el usuario final.';
create index asistente_evento_expediente_idx on public.asistente_evento(expediente_id);
create index asistente_evento_usuario_idx on public.asistente_evento(usuario_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ficha_normativa     enable row level security;
alter table public.imprevisto_catalogo enable row level security;
alter table public.asistente_evento    enable row level security;

-- Referencia: lectura para autenticados; escritura solo admin.
create policy ficha_normativa_select on public.ficha_normativa
  for select to authenticated using (true);
create policy ficha_normativa_insert on public.ficha_normativa
  for insert to authenticated with check (mi_rol() = 'administrador'::rol_usuario);
create policy ficha_normativa_update on public.ficha_normativa
  for update to authenticated
  using (mi_rol() = 'administrador'::rol_usuario)
  with check (mi_rol() = 'administrador'::rol_usuario);
create policy ficha_normativa_delete on public.ficha_normativa
  for delete to authenticated using (mi_rol() = 'administrador'::rol_usuario);

create policy imprevisto_catalogo_select on public.imprevisto_catalogo
  for select to authenticated using (true);
create policy imprevisto_catalogo_insert on public.imprevisto_catalogo
  for insert to authenticated with check (mi_rol() = 'administrador'::rol_usuario);
create policy imprevisto_catalogo_update on public.imprevisto_catalogo
  for update to authenticated
  using (mi_rol() = 'administrador'::rol_usuario)
  with check (mi_rol() = 'administrador'::rol_usuario);
create policy imprevisto_catalogo_delete on public.imprevisto_catalogo
  for delete to authenticated using (mi_rol() = 'administrador'::rol_usuario);

-- Eventos: los escribe la edge function con service_role (bypassa RLS).
-- Lectura: admin (todo) y estimador (los de sus expedientes) para futuros paneles.
create policy asistente_evento_select_admin on public.asistente_evento
  for select to authenticated
  using (mi_rol() = 'administrador'::rol_usuario);
create policy asistente_evento_select_estimador on public.asistente_evento
  for select to authenticated
  using (
    mi_rol() = 'estimador'::rol_usuario
    and exists (
      select 1 from public.expediente e
      where e.id = asistente_evento.expediente_id
        and e.estimador_id = auth.uid()
    )
  );

-- Semilla de fichas normativas e imprevistos: ver la migración aplicada vía MCP
-- (asistente_ia_referencias_y_eventos). Contenido trilingüe FR/EN/ES.
