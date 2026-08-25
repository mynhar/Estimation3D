-- ============================================================
-- Matterport: información de la propiedad escaneada
--
-- Cada expediente estimado lleva en `estimacion.url_tour` una o
-- varias URLs de tour 3D de Matterport. Esta tabla guarda, por
-- expediente y por modelo, la ficha que devuelve la Model API de
-- Matterport (nombre, dirección, geolocalización, superficies,
-- pisos y habitaciones con sus dimensiones).
--
-- Escritura: SOLO la edge function `matterport-sync`, que corre
-- con service role (bypasa RLS) y es la única que conoce las
-- credenciales de la API. Por eso no hay políticas de INSERT /
-- UPDATE / DELETE para `authenticated`.
--
-- Lectura: mismo criterio que `estimacion_select` — el cliente
-- dueño del expediente, y los roles internos. El acceso real del
-- constructor lo sigue acotando `expediente_select` (invitación).
-- ============================================================


-- ── 1. Tabla ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matterport_modelo (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id          uuid        NOT NULL REFERENCES expediente(id) ON DELETE CASCADE,

  -- Identidad del modelo en Matterport (`?m=<model_id>` de la URL del tour).
  model_id               text        NOT NULL,
  url_tour               text        NOT NULL,
  nombre                 text,
  descripcion            text,
  estado                 text,       -- ModelState de Matterport
  visibilidad            text,       -- ModelVisibility de Matterport

  -- Dirección tal como la reporta Matterport (puede diferir de la
  -- capturada en el expediente; se guarda sin normalizar).
  direccion              text,
  calle                  text,
  ciudad                 text,
  region                 text,
  codigo_postal          text,
  pais                   text,
  latitud                numeric,
  longitud               numeric,

  -- Dimensiones totales del modelo, en métrico.
  area_piso_m2           numeric,
  area_piso_interior_m2  numeric,
  area_pared_m2          numeric,
  area_techo_m2          numeric,
  volumen_m3             numeric,
  alto_m                 numeric,
  ancho_m                numeric,
  profundidad_m          numeric,

  -- El mercado inmobiliario canadiense cotiza en pie²: se guardan
  -- los valores que devuelve Matterport en imperial, no una
  -- conversión hecha aquí.
  area_piso_ft2          numeric,
  area_piso_interior_ft2 numeric,

  -- Estructura del inmueble. `pisos` y `habitaciones` conservan la
  -- lista completa con etiqueta, secuencia, tags y dimensiones.
  total_pisos            integer,
  total_habitaciones     integer,
  pisos                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  habitaciones           jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Presentación pública del modelo.
  imagen_url             text,
  share_url              text,
  publicado              boolean,
  resumen_publico        text,

  -- Trazabilidad de la sincronización.
  creado_matterport      timestamptz,
  modificado_matterport  timestamptz,
  datos_crudos           jsonb,
  sincronizado_en        timestamptz NOT NULL DEFAULT now(),
  sincronizado_por       uuid                 REFERENCES perfil(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (expediente_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_matterport_modelo_expediente
  ON matterport_modelo (expediente_id);


-- ── 2. RLS ──────────────────────────────────────────────────

ALTER TABLE matterport_modelo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matterport_modelo_select" ON matterport_modelo;
CREATE POLICY "matterport_modelo_select"
ON matterport_modelo FOR SELECT TO authenticated
USING (
  mi_rol() = ANY (ARRAY['estimador'::rol_usuario, 'administrador'::rol_usuario, 'constructor'::rol_usuario])
  OR EXISTS (
    SELECT 1 FROM expediente e
    WHERE e.id = matterport_modelo.expediente_id
      AND e.cliente_id = auth.uid()
  )
);
