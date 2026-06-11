-- =====================================================================
-- ESTIMATION3D — Módulo "Seguimiento de la Ejecución de la Obra"
-- Migración Supabase (PostgreSQL) · Versión 1.0 · junio 2026
-- ---------------------------------------------------------------------
-- Extiende el modelo existente (expediente, contrato, servicio, perfil,
-- archivo) para soportar el registro del avance diario de la obra,
-- fases/actividades por servicio, desglose por zona e inspecciones.
--
-- Convenciones: snake_case, UUID v4 como PK, RLS activado en todas las
-- tablas, timestamps con zona horaria. Idiomas FR/EN/ES en catálogos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. ENUMS NUEVOS
-- ---------------------------------------------------------------------

-- Estado del seguimiento de la obra (cabecera por contrato)
do $$ begin
  create type estado_seguimiento as enum (
    'no_iniciado',   -- contrato firmado, aún sin primer reporte
    'en_progreso',   -- al menos un reporte diario registrado
    'pausado',       -- obra detenida temporalmente
    'completado'     -- 100% de avance / contrato completado
  );
exception when duplicate_object then null; end $$;

-- Quién realiza la visita de control
do $$ begin
  create type tipo_visitante as enum ('inspector', 'dueno');
exception when duplicate_object then null; end $$;

-- Estado de una inspección/visita programada
do $$ begin
  create type estado_inspeccion as enum ('programada', 'realizada', 'cancelada');
exception when duplicate_object then null; end $$;

-- Se amplía el enum de tipo de archivo para reportes diarios (si existe).
-- En instalaciones existentes ejecutar por separado si el enum ya está creado:
do $$ begin
  alter type tipo_archivo add value if not exists 'reporte_foto';
exception when undefined_object then null; end $$;
do $$ begin
  alter type tipo_archivo add value if not exists 'reporte_video';
exception when undefined_object then null; end $$;
do $$ begin
  alter type tipo_archivo add value if not exists 'reporte_documento';
exception when undefined_object then null; end $$;


-- ---------------------------------------------------------------------
-- 1. CATÁLOGO: FASES POR SERVICIO
--    Cada servicio (moho, amianto, agua, ...) tiene su propia lista de
--    fases/etapas ordenadas. Multilingüe.
-- ---------------------------------------------------------------------
create table if not exists fase_servicio (
  id            uuid primary key default gen_random_uuid(),
  servicio_id   int  not null references servicio(id) on delete cascade,
  codigo        text not null,                 -- p.ej. 'preparacion_encubrimiento'
  orden         int  not null,                 -- secuencia dentro del servicio
  nombre_fr     text not null,
  nombre_en     text not null,
  nombre_es     text not null,
  descripcion_fr text,
  descripcion_en text,
  descripcion_es text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (servicio_id, codigo),
  unique (servicio_id, orden)
);
create index if not exists idx_fase_servicio_servicio on fase_servicio(servicio_id);

comment on table fase_servicio is 'Fases/etapas de obra propias de cada tipo de servicio.';


-- ---------------------------------------------------------------------
-- 2. CATÁLOGO: ACTIVIDADES POR SERVICIO
--    Lista de actividades seleccionables en el reporte diario. Pueden
--    asociarse opcionalmente a una fase.
-- ---------------------------------------------------------------------
create table if not exists actividad_servicio (
  id            uuid primary key default gen_random_uuid(),
  servicio_id   int  not null references servicio(id) on delete cascade,
  fase_id       uuid references fase_servicio(id) on delete set null,
  codigo        text not null,
  nombre_fr     text not null,
  nombre_en     text not null,
  nombre_es     text not null,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (servicio_id, codigo)
);
create index if not exists idx_actividad_servicio_servicio on actividad_servicio(servicio_id);
create index if not exists idx_actividad_servicio_fase on actividad_servicio(fase_id);

comment on table actividad_servicio is 'Actividades seleccionables en el reporte diario, por servicio.';


-- ---------------------------------------------------------------------
-- 3. CABECERA DE SEGUIMIENTO (1:1 con contrato)
--    Una fila por obra en ejecución. Agrega el avance total.
-- ---------------------------------------------------------------------
create table if not exists seguimiento_obra (
  id                 uuid primary key default gen_random_uuid(),
  contrato_id        uuid not null unique references contrato(id) on delete cascade,
  expediente_id      uuid not null references expediente(id) on delete cascade,
  constructor_id     uuid not null references perfil(id),
  estado             estado_seguimiento not null default 'no_iniciado',
  fecha_inicio_real  timestamptz,             -- primer día de trabajo (set en 1er reporte)
  fecha_fin_real     timestamptz,             -- al completar
  porcentaje_avance  numeric(5,2) not null default 0
                       check (porcentaje_avance >= 0 and porcentaje_avance <= 100),
  fase_actual_id     uuid references fase_servicio(id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index if not exists idx_seguimiento_expediente on seguimiento_obra(expediente_id);
create index if not exists idx_seguimiento_constructor on seguimiento_obra(constructor_id);

comment on table seguimiento_obra is 'Cabecera 1:1 con contrato; agrega el avance global de la obra.';


-- ---------------------------------------------------------------------
-- 4. REPORTE DIARIO
--    Un registro por día trabajado. Horas por defecto: inicio 07:00, 8h.
-- ---------------------------------------------------------------------
create table if not exists reporte_diario (
  id                    uuid primary key default gen_random_uuid(),
  seguimiento_id        uuid not null references seguimiento_obra(id) on delete cascade,
  constructor_id        uuid not null references perfil(id),
  fecha                 date not null,                     -- día, mes, año
  hora_inicio           time not null default '07:00',
  hora_fin              time,
  horas_trabajadas      numeric(4,2) not null default 8
                          check (horas_trabajadas >= 0 and horas_trabajadas <= 24),
  porcentaje_avance_dia numeric(5,2) not null default 0
                          check (porcentaje_avance_dia >= 0 and porcentaje_avance_dia <= 100),
  porcentaje_acumulado  numeric(5,2)
                          check (porcentaje_acumulado >= 0 and porcentaje_acumulado <= 100),
  fase_id               uuid references fase_servicio(id), -- fase del día (requerido a nivel app)
  descripcion           text,                              -- opcional
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  -- Un solo reporte por día por obra
  unique (seguimiento_id, fecha)
);
create index if not exists idx_reporte_seguimiento on reporte_diario(seguimiento_id);
create index if not exists idx_reporte_fecha on reporte_diario(fecha);

comment on table reporte_diario is 'Registro de avance de un día trabajado para una obra.';


-- ---------------------------------------------------------------------
-- 5. ACTIVIDADES REALIZADAS EN EL DÍA (M:N reporte ↔ actividad)
-- ---------------------------------------------------------------------
create table if not exists reporte_actividad (
  id            uuid primary key default gen_random_uuid(),
  reporte_id    uuid not null references reporte_diario(id) on delete cascade,
  actividad_id  uuid not null references actividad_servicio(id),
  creado_en     timestamptz not null default now(),
  unique (reporte_id, actividad_id)
);
create index if not exists idx_reporte_actividad_reporte on reporte_actividad(reporte_id);

comment on table reporte_actividad is 'Actividades del catálogo realizadas en un reporte diario.';


-- ---------------------------------------------------------------------
-- 6. DESGLOSE POR ZONA (avance por zona dentro de un reporte)
-- ---------------------------------------------------------------------
create table if not exists reporte_zona (
  id                 uuid primary key default gen_random_uuid(),
  reporte_id         uuid not null references reporte_diario(id) on delete cascade,
  zona               text not null,            -- p.ej. 'Zona A', 'Sótano'
  descripcion        text,
  porcentaje_avance  numeric(5,2)
                       check (porcentaje_avance >= 0 and porcentaje_avance <= 100),
  creado_en          timestamptz not null default now()
);
create index if not exists idx_reporte_zona_reporte on reporte_zona(reporte_id);

comment on table reporte_zona is 'Avance desglosado por zona dentro de un reporte diario.';


-- ---------------------------------------------------------------------
-- 7. INSPECCIONES / VISITAS DE CONTROL PROGRAMADAS
-- ---------------------------------------------------------------------
create table if not exists inspeccion (
  id              uuid primary key default gen_random_uuid(),
  seguimiento_id  uuid not null references seguimiento_obra(id) on delete cascade,
  tipo_visitante  tipo_visitante not null,
  fecha           date not null,
  hora            time not null,
  motivo          text,                          -- descripción / motivo
  estado          estado_inspeccion not null default 'programada',
  creado_por      uuid not null references perfil(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_inspeccion_seguimiento on inspeccion(seguimiento_id);
create index if not exists idx_inspeccion_fecha on inspeccion(fecha);

comment on table inspeccion is 'Visitas de control (inspector/dueño) agendadas para una obra.';


-- ---------------------------------------------------------------------
-- 8. VÍNCULO DE ARCHIVOS A REPORTES DIARIOS
--    Se añade columna a la tabla archivo existente para asociar
--    fotos/videos/documentos a un reporte diario concreto.
-- ---------------------------------------------------------------------
alter table archivo
  add column if not exists reporte_id uuid references reporte_diario(id) on delete cascade;
create index if not exists idx_archivo_reporte on archivo(reporte_id);


-- =====================================================================
-- 9. TRIGGERS
-- =====================================================================

-- 9.1 Mantener actualizado_en
create or replace function set_actualizado_en() returns trigger as $$
begin
  new.actualizado_en := now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_seguimiento_upd on seguimiento_obra;
create trigger trg_seguimiento_upd before update on seguimiento_obra
  for each row execute function set_actualizado_en();

drop trigger if exists trg_reporte_upd on reporte_diario;
create trigger trg_reporte_upd before update on reporte_diario
  for each row execute function set_actualizado_en();

drop trigger if exists trg_inspeccion_upd on inspeccion;
create trigger trg_inspeccion_upd before update on inspeccion
  for each row execute function set_actualizado_en();

-- 9.2 Al insertar el primer reporte: fijar fecha_inicio_real, estado y avance
create or replace function fn_reporte_actualiza_seguimiento() returns trigger as $$
declare
  v_max_acumulado numeric(5,2);
begin
  -- fecha de inicio real = primer reporte
  update seguimiento_obra s
     set fecha_inicio_real = coalesce(s.fecha_inicio_real, (new.fecha::timestamptz + new.hora_inicio)),
         estado = case when s.estado = 'no_iniciado' then 'en_progreso'::estado_seguimiento
                       else s.estado end,
         fase_actual_id = coalesce(new.fase_id, s.fase_actual_id)
   where s.id = new.seguimiento_id;

  -- recalcular avance global = mayor acumulado reportado
  select max(porcentaje_acumulado) into v_max_acumulado
    from reporte_diario where seguimiento_id = new.seguimiento_id;

  update seguimiento_obra
     set porcentaje_avance = coalesce(v_max_acumulado, porcentaje_avance),
         estado = case when coalesce(v_max_acumulado,0) >= 100 then 'completado'::estado_seguimiento
                       else estado end,
         fecha_fin_real = case when coalesce(v_max_acumulado,0) >= 100 then now()
                               else fecha_fin_real end
   where id = new.seguimiento_id;

  return new;
end; $$ language plpgsql;

drop trigger if exists trg_reporte_seguimiento on reporte_diario;
create trigger trg_reporte_seguimiento after insert or update on reporte_diario
  for each row execute function fn_reporte_actualiza_seguimiento();

-- 9.3 Crear cabecera de seguimiento automáticamente al firmar el contrato
--     (cuando contrato pasa a 'firmado'). Idempotente.
create or replace function fn_contrato_crea_seguimiento() returns trigger as $$
begin
  if new.estado = 'firmado' and (old.estado is distinct from new.estado) then
    insert into seguimiento_obra (contrato_id, expediente_id, constructor_id)
    values (new.id, new.expediente_id, new.constructor_id)
    on conflict (contrato_id) do nothing;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_contrato_seguimiento on contrato;
create trigger trg_contrato_seguimiento after update on contrato
  for each row execute function fn_contrato_crea_seguimiento();


-- =====================================================================
-- 10. ROW LEVEL SECURITY (RLS)
--     Patrón: el constructor adjudicado y el cliente del expediente
--     pueden leer; el constructor escribe sus reportes; el admin todo.
-- =====================================================================

-- Helper: rol del usuario actual
create or replace function fn_rol_actual() returns text as $$
  select rol::text from perfil where id = auth.uid();
$$ language sql stable security definer;

alter table fase_servicio       enable row level security;
alter table actividad_servicio  enable row level security;
alter table seguimiento_obra    enable row level security;
alter table reporte_diario      enable row level security;
alter table reporte_actividad   enable row level security;
alter table reporte_zona        enable row level security;
alter table inspeccion          enable row level security;

-- 10.1 Catálogos (fase/actividad): lectura para autenticados, escritura admin
drop policy if exists fase_select   on fase_servicio;
drop policy if exists fase_admin    on fase_servicio;
create policy fase_select on fase_servicio for select
  to authenticated using (true);
create policy fase_admin on fase_servicio for all
  to authenticated using (fn_rol_actual() = 'administrador')
  with check (fn_rol_actual() = 'administrador');

drop policy if exists actividad_select on actividad_servicio;
drop policy if exists actividad_admin  on actividad_servicio;
create policy actividad_select on actividad_servicio for select
  to authenticated using (true);
create policy actividad_admin on actividad_servicio for all
  to authenticated using (fn_rol_actual() = 'administrador')
  with check (fn_rol_actual() = 'administrador');

-- 10.2 Seguimiento: ve el constructor dueño, el cliente del expediente, y admin
drop policy if exists seguimiento_select on seguimiento_obra;
drop policy if exists seguimiento_insert on seguimiento_obra;
drop policy if exists seguimiento_update on seguimiento_obra;
create policy seguimiento_select on seguimiento_obra for select
  to authenticated using (
    fn_rol_actual() = 'administrador'
    or constructor_id = auth.uid()
    or exists (select 1 from expediente e
               where e.id = seguimiento_obra.expediente_id
                 and e.cliente_id = auth.uid())
  );
-- Constructor puede crear seguimiento de su propio contrato (backup si trigger no disparó)
create policy seguimiento_insert on seguimiento_obra for insert
  to authenticated
  with check (
    fn_rol_actual() = 'administrador'
    or (constructor_id = auth.uid()
        and exists (select 1 from contrato c
                    where c.id = seguimiento_obra.contrato_id
                      and c.constructor_id = auth.uid()))
  );
create policy seguimiento_update on seguimiento_obra for update
  to authenticated using (
    fn_rol_actual() = 'administrador' or constructor_id = auth.uid()
  );

-- 10.3 Reporte diario: el constructor dueño escribe; cliente lee; admin todo
drop policy if exists reporte_select on reporte_diario;
drop policy if exists reporte_write  on reporte_diario;
create policy reporte_select on reporte_diario for select
  to authenticated using (
    fn_rol_actual() = 'administrador'
    or constructor_id = auth.uid()
    or exists (select 1 from seguimiento_obra s
               join expediente e on e.id = s.expediente_id
               where s.id = reporte_diario.seguimiento_id
                 and e.cliente_id = auth.uid())
  );
create policy reporte_write on reporte_diario for all
  to authenticated using (
    fn_rol_actual() = 'administrador' or constructor_id = auth.uid()
  )
  with check (
    fn_rol_actual() = 'administrador' or constructor_id = auth.uid()
  );

-- 10.4 Sub-tablas de reporte heredan vía existencia del reporte
drop policy if exists reporte_act_all on reporte_actividad;
create policy reporte_act_all on reporte_actividad for all
  to authenticated using (
    exists (select 1 from reporte_diario r
            where r.id = reporte_actividad.reporte_id
              and (fn_rol_actual() = 'administrador' or r.constructor_id = auth.uid()))
  )
  with check (
    exists (select 1 from reporte_diario r
            where r.id = reporte_actividad.reporte_id
              and (fn_rol_actual() = 'administrador' or r.constructor_id = auth.uid()))
  );

drop policy if exists reporte_zona_all on reporte_zona;
create policy reporte_zona_all on reporte_zona for all
  to authenticated using (
    exists (select 1 from reporte_diario r
            where r.id = reporte_zona.reporte_id
              and (fn_rol_actual() = 'administrador' or r.constructor_id = auth.uid()))
  )
  with check (
    exists (select 1 from reporte_diario r
            where r.id = reporte_zona.reporte_id
              and (fn_rol_actual() = 'administrador' or r.constructor_id = auth.uid()))
  );

-- 10.5 Inspecciones: ve constructor, cliente y admin; escribe constructor/admin
drop policy if exists inspeccion_select on inspeccion;
drop policy if exists inspeccion_write  on inspeccion;
create policy inspeccion_select on inspeccion for select
  to authenticated using (
    fn_rol_actual() = 'administrador'
    or exists (select 1 from seguimiento_obra s
               join expediente e on e.id = s.expediente_id
               where s.id = inspeccion.seguimiento_id
                 and (s.constructor_id = auth.uid() or e.cliente_id = auth.uid()))
  );
create policy inspeccion_write on inspeccion for all
  to authenticated using (
    fn_rol_actual() = 'administrador'
    or exists (select 1 from seguimiento_obra s
               where s.id = inspeccion.seguimiento_id and s.constructor_id = auth.uid())
  )
  with check (
    fn_rol_actual() = 'administrador'
    or exists (select 1 from seguimiento_obra s
               where s.id = inspeccion.seguimiento_id and s.constructor_id = auth.uid())
  );

-- =====================================================================
-- 10.6 RLS TABLA contrato — CRÍTICO: ausente en migraciones anteriores
--      Sin estas políticas, RLS habilitado sin reglas bloquea todas las
--      consultas directas desde el frontend.
-- =====================================================================

alter table contrato enable row level security;

drop policy if exists "contrato_select_cliente"      on contrato;
drop policy if exists "contrato_select_constructor"  on contrato;
drop policy if exists "contrato_select_admin"        on contrato;
drop policy if exists "contrato_select_estimador"    on contrato;

-- Cliente ve sus contratos
create policy "contrato_select_cliente" on contrato for select to authenticated
using (cliente_id = auth.uid());

-- Constructor ve sus contratos firmados / activos (no 'generado')
create policy "contrato_select_constructor" on contrato for select to authenticated
using (
  constructor_id = auth.uid()
  and estado in ('firmado', 'en_ejecucion', 'completado', 'cancelado')
  and exists (select 1 from perfil where id = auth.uid() and rol = 'constructor')
);

-- Estimador ve contratos de expedientes asignados
create policy "contrato_select_estimador" on contrato for select to authenticated
using (
  exists (
    select 1 from expediente e
    where e.id = contrato.expediente_id and e.estimador_id = auth.uid()
  )
  and exists (select 1 from perfil where id = auth.uid() and rol = 'estimador')
);

-- Administrador ve todos
create policy "contrato_select_admin" on contrato for select to authenticated
using (exists (select 1 from perfil where id = auth.uid() and rol = 'administrador'));

commit;

-- =====================================================================
-- 11. SEED — Fases y actividades por servicio
--     Fuente: "Seguimiento de la ejecución de la obra.docx".
--     'Descontaminación de moho' está completo; los otros 5 servicios
--     quedan como placeholders pendientes de validación de dominio.
-- =====================================================================

-- 11.1 Fases — Descontaminación de moho (5 fases, ordenadas)
insert into fase_servicio (servicio_id, codigo, orden, nombre_es, nombre_en, nombre_fr)
select s.id, v.codigo, v.orden, v.nombre_es, v.nombre_en, v.nombre_fr
from servicio s
cross join (values
  ('preparacion_encubrimiento', 1, 'Preparación · encubrimiento', 'Preparation · containment',   'Préparation · confinement'),
  ('descontaminacion_zona_a',    2, 'Descontaminación zona A',     'Decontamination zone A',       'Décontamination zone A'),
  ('tratamiento_zona_b',         3, 'Tratamiento zona B',          'Zone B treatment',             'Traitement zone B'),
  ('limpieza_restauracion',      4, 'Limpieza y restauración',     'Cleaning and restoration',     'Nettoyage et restauration'),
  ('inspeccion_final',           5, 'Inspección final',            'Final inspection',             'Inspection finale')
) as v(codigo, orden, nombre_es, nombre_en, nombre_fr)
where s.codigo = 'descontaminacion_moho'::tipo_servicio
on conflict (servicio_id, codigo) do nothing;

-- 11.2 Actividades — Descontaminación de moho
insert into actividad_servicio (servicio_id, codigo, nombre_es, nombre_en, nombre_fr)
select s.id, v.codigo, v.nombre_es, v.nombre_en, v.nombre_fr
from servicio s
cross join (values
  ('llegada_sitio',            'Llegada al sitio',              'Arrival on site',            'Arrivée sur le site'),
  ('material_descargado',      'Material descargado',           'Material unloaded',          'Matériel déchargé'),
  ('encubrimiento_zona_a',     'Encubrimiento zona A terminado','Zone A containment complete','Confinement zone A terminé'),
  ('descontaminacion_zona_a',  'Descontaminación zona A',       'Zone A decontamination',     'Décontamination zone A'),
  ('prueba_aire_zona_a',       'Prueba de aire zona A · OK',    'Zone A air test · OK',       'Test d''air zone A · OK')
) as v(codigo, nombre_es, nombre_en, nombre_fr)
where s.codigo = 'descontaminacion_moho'::tipo_servicio
on conflict (servicio_id, codigo) do nothing;

-- 11.3 Placeholders — otros 5 servicios
do $$
declare
  v_serv text;
  v_id   int;
  i      int;
begin
  foreach v_serv in array array['desamiantado','danos_agua','demolicion_interior','aislamiento','fundacion_dren_frances']
  loop
    begin
      select id into v_id from servicio where codigo = v_serv::tipo_servicio;
    exception when invalid_text_representation then
      continue;
    end;
    if not found or v_id is null then continue; end if;
    for i in 1..5 loop
      insert into fase_servicio (servicio_id, codigo, orden, nombre_es, nombre_en, nombre_fr)
      values (v_id, 'fase_'||lpad(i::text,2,'0'), i,
              'Fase '||lpad(i::text,2,'0'), 'Phase '||lpad(i::text,2,'0'), 'Phase '||lpad(i::text,2,'0'))
      on conflict (servicio_id, codigo) do nothing;

      insert into actividad_servicio (servicio_id, codigo, nombre_es, nombre_en, nombre_fr)
      values (v_id, 'actividad_'||lpad(i::text,2,'0'),
              'Actividad '||lpad(i::text,2,'0'), 'Activity '||lpad(i::text,2,'0'), 'Activité '||lpad(i::text,2,'0'))
      on conflict (servicio_id, codigo) do nothing;
    end loop;
  end loop;
end $$;

-- =====================================================================
-- 12. BACKFILL — seguimiento_obra para contratos ya firmados/activos
--     Para contratos creados antes de esta migración (el trigger no habrá
--     disparado). Idempotente: ON CONFLICT DO NOTHING.
-- =====================================================================
insert into seguimiento_obra (contrato_id, expediente_id, constructor_id,
                               estado, porcentaje_avance)
select
  c.id,
  c.expediente_id,
  c.constructor_id,
  case c.estado
    when 'firmado'       then 'no_iniciado'::estado_seguimiento
    when 'en_ejecucion'  then 'en_progreso'::estado_seguimiento
    when 'completado'    then 'completado'::estado_seguimiento
    else                      'no_iniciado'::estado_seguimiento
  end,
  case c.estado when 'completado' then 100 else 0 end
from contrato c
where c.estado in ('firmado', 'en_ejecucion', 'completado')
on conflict (contrato_id) do nothing;

-- =====================================================================
-- 13. ÍNDICES ADICIONALES en tablas existentes (DBA finding)
-- =====================================================================
create index if not exists idx_contrato_constructor_id  on contrato (constructor_id);
create index if not exists idx_contrato_cliente_id      on contrato (cliente_id);
create index if not exists idx_contrato_estado          on contrato (estado);
create index if not exists idx_contrato_actualizado_en  on contrato (actualizado_en desc);
create index if not exists idx_perfil_id_rol            on perfil (id, rol);
create index if not exists idx_expediente_cliente_id    on expediente (cliente_id);
create index if not exists idx_expediente_estimador_id  on expediente (estimador_id);
create index if not exists idx_expediente_estado        on expediente (estado);
