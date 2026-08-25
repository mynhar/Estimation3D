// Sincroniza con Matterport la ficha de la propiedad escaneada de un expediente.
//
// El estimador guarda en `estimacion.url_tour` una o varias URLs de tour 3D
// (`https://my.matterport.com/show/?m=<model_id>`). Esta función extrae el
// model id de cada URL, consulta la Model API de Matterport (GraphQL) y guarda
// la ficha resultante en `matterport_modelo`, una fila por modelo: nombre,
// dirección, geolocalización, superficies, volumen, y la lista de pisos y
// habitaciones con sus dimensiones.
//
// Las credenciales de Matterport viven SOLO aquí, como secretos
// (MATTERPORT_TOKEN_ID / MATTERPORT_TOKEN_SECRET), nunca en el frontend. La
// Model API autentica con Basic auth sobre ese par de credenciales y solo
// devuelve modelos de la organización dueña del token — que es la que hace los
// escaneos.
//
// La escritura la hace el service role: `matterport_modelo` no tiene políticas
// de escritura para `authenticated`, así que esta es la única vía de entrada.
// Los modelos que ya no estén en `url_tour` se eliminan, para que la ficha
// guardada nunca sobreviva al tour que la originó.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MATTERPORT_GRAPH = 'https://api.matterport.com/api/models/graph';

// `dimensions(units:)` toma un enum único, no una lista: cada consulta devuelve
// las medidas ya en un solo sistema, como escalares. El mercado canadiense
// cotiza en pie², así que el modelo se pide dos veces — métrico y, con alias,
// imperial — y de la segunda solo interesan las superficies.
const QUERY_MODELO = `
query FichaModelo($id: ID!) {
  model(id: $id) {
    id
    name
    description
    created
    modified
    state
    visibility
    image { url }
    address {
      address
      streetAddressLines
      locality
      administrativeArea
      postalCode
      countryCode
      countryName
    }
    geolocation { lat long }
    dimensions(units: metric) {
      areaFloor
      areaFloorIndoor
      areaWall
      areaCeiling
      volume
      height
      width
      depth
    }
    imperial: dimensions(units: imperial) {
      areaFloor
      areaFloorIndoor
    }
    publication { published url summary address }
    floors {
      id
      label
      sequence
      dimensions(units: metric) { areaFloor areaFloorIndoor volume height width depth }
    }
    rooms {
      id
      label
      tags
      floor { id label sequence }
      dimensions(units: metric) { areaFloor areaFloorIndoor volume height width depth }
    }
  }
}`.trim();

/** Dimensiones de Matterport en el sistema de unidades que se pidió. */
interface DimensionRaw {
  areaFloor?:        number | null;
  areaFloorIndoor?:  number | null;
  areaWall?:         number | null;
  areaCeiling?:      number | null;
  volume?:           number | null;
  height?:           number | null;
  width?:            number | null;
  depth?:            number | null;
}

interface FloorRaw {
  id: string;
  label?: string | null;
  sequence?: number | null;
  dimensions?: DimensionRaw | null;
}

interface RoomRaw {
  id: string;
  label?: string | null;
  tags?: (string | null)[] | null;
  floor?: { id: string; label?: string | null; sequence?: number | null } | null;
  dimensions?: DimensionRaw | null;
}

interface ModelRaw {
  id:           string;
  name?:        string | null;
  description?: string | null;
  created?:     string | null;
  modified?:    string | null;
  state?:       string | null;
  visibility?:  string | null;
  image?:       { url?: string | null } | null;
  address?: {
    address?:            string | null;
    streetAddressLines?: (string | null)[] | null;
    locality?:           string | null;
    administrativeArea?: string | null;
    postalCode?:         string | null;
    countryCode?:        string | null;
    countryName?:        string | null;
  } | null;
  geolocation?: { lat?: string | null; long?: string | null } | null;
  dimensions?:  DimensionRaw | null;
  imperial?:    DimensionRaw | null;
  publication?: {
    published?: boolean | null;
    url?:       string | null;
    summary?:   string | null;
    address?:   string | null;
  } | null;
  floors?: (FloorRaw | null)[] | null;
  rooms?:  (RoomRaw  | null)[] | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return fail('no_autorizado', 'No autorizado', 401);
    }

    const tokenId     = Deno.env.get('MATTERPORT_TOKEN_ID');
    const tokenSecret = Deno.env.get('MATTERPORT_TOKEN_SECRET');
    if (!tokenId || !tokenSecret) {
      return fail('matterport_no_configurado', 'Faltan las credenciales de Matterport en el servidor', 503);
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verificar el JWT y el rol. Sincronizar es una operación interna: la
    //    dispara quien trabaja el expediente, no el cliente ni el constructor.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return fail('token_invalido', 'Token inválido o expirado', 401);
    }

    const { data: perfil } = await adminClient
      .from('perfil').select('rol').eq('id', user.id).single();
    if (perfil?.rol !== 'administrador' && perfil?.rol !== 'estimador') {
      return fail('rol_no_permitido', 'Acceso denegado: se requiere rol administrador o estimador', 403);
    }

    // 2. Cuerpo
    const { expediente_id } = await req.json().catch(() => ({ expediente_id: null }));
    if (!expediente_id) {
      return fail('campos_requeridos', 'Campo requerido: expediente_id', 400);
    }

    // 3. Tours del expediente
    const { data: estimacion, error: estError } = await adminClient
      .from('estimacion')
      .select('url_tour')
      .eq('expediente_id', expediente_id)
      .maybeSingle();
    if (estError) {
      return fail('error_interno', 'No se pudo leer la estimación', 500, estError.message);
    }

    const urls = parseTourUrls(estimacion?.url_tour ?? null);
    // Un mismo model id puede aparecer dos veces (la misma URL con parámetros
    // distintos); se conserva la primera aparición.
    const porModelId = new Map<string, string>();
    for (const url of urls) {
      const id = modelIdDeUrl(url);
      if (id && !porModelId.has(id)) porModelId.set(id, url);
    }

    if (porModelId.size === 0) {
      // Sin tours no hay nada que sincronizar, pero sí que limpiar: si el
      // estimador borró la URL, su ficha no debe quedarse colgando.
      await adminClient.from('matterport_modelo').delete().eq('expediente_id', expediente_id);
      return fail('expediente_sin_tour', 'El expediente no tiene ningún tour de Matterport', 400);
    }

    // 4. Consultar Matterport, modelo a modelo
    const basic = btoa(`${tokenId}:${tokenSecret}`);
    const filas: Record<string, unknown>[] = [];
    const errores: { model_id: string; detalle: string }[] = [];

    for (const [modelId, urlTour] of porModelId) {
      try {
        const modelo = await consultarModelo(modelId, basic);
        if (!modelo) {
          errores.push({ model_id: modelId, detalle: 'Matterport no devolvió ningún modelo con ese id' });
          continue;
        }
        filas.push(aFila(expediente_id, modelId, urlTour, modelo, user.id));
      } catch (e) {
        errores.push({ model_id: modelId, detalle: e instanceof Error ? e.message : String(e) });
      }
    }

    if (filas.length === 0) {
      const detalle = errores.map(e => `${e.model_id}: ${e.detalle}`).join(' | ');
      // `model.locked` es una restricción de licencia de la cuenta de Matterport,
      // no una caída del servicio: merece un mensaje que diga qué hacer.
      if (errores.every(e => e.detalle.includes('model.locked'))) {
        return fail('matterport_modelo_bloqueado', 'El modelo no tiene desbloqueada la licencia de desarrollador', 403, detalle);
      }
      return fail('matterport_error', 'Matterport no devolvió datos para ningún tour', 502, detalle);
    }

    // 5. Guardar. Primero se borran los modelos que ya no están en `url_tour`,
    //    después se insertan/actualizan los vigentes.
    const vigentes = filas.map(f => f['model_id'] as string);
    const { error: delError } = await adminClient
      .from('matterport_modelo')
      .delete()
      .eq('expediente_id', expediente_id)
      .not('model_id', 'in', `(${vigentes.map(m => `"${m}"`).join(',')})`);
    if (delError) {
      return fail('error_interno', 'No se pudieron limpiar los modelos obsoletos', 500, delError.message);
    }

    const { error: upError } = await adminClient
      .from('matterport_modelo')
      .upsert(filas, { onConflict: 'expediente_id,model_id' });
    if (upError) {
      return fail('error_interno', 'No se pudo guardar la ficha de Matterport', 500, upError.message);
    }

    if (errores.length) {
      console.warn(`[matterport-sync] parcial: ${errores.map(e => `${e.model_id}: ${e.detalle}`).join(' | ')}`);
    }
    return json({ sincronizados: filas.length, fallidos: errores.length, errores }, 200);

  } catch (e) {
    return fail('error_interno', 'Error interno', 500, e instanceof Error ? e.message : String(e));
  }
});

// ── Matterport ───────────────────────────────────────────────────────────────

async function consultarModelo(modelId: string, basic: string): Promise<ModelRaw | null> {
  const res = await fetch(MATTERPORT_GRAPH, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${basic}`,
    },
    body: JSON.stringify({ query: QUERY_MODELO, variables: { id: modelId } }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${cuerpo.slice(0, 300)}`);
  }

  const payload = await res.json();
  // GraphQL responde 200 con `errors` cuando la consulta falla; hay que mirar
  // el cuerpo, no solo el código HTTP.
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(payload.errors.map((e: { message?: string }) => e?.message ?? '?').join('; ').slice(0, 800));
  }
  return (payload?.data?.model ?? null) as ModelRaw | null;
}

/** Extrae las URLs de `url_tour` (URL simple o lista JSON serializada). */
function parseTourUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
  } catch { /* no era JSON */ }
  return [raw];
}

/** Model id de una URL de Matterport (`?m=…` o `&m=…`). */
function modelIdDeUrl(url: string): string | null {
  return url.match(/[?&]m=([A-Za-z0-9]+)/)?.[1] ?? null;
}

/** Valor de una medida, ya en las unidades con que se pidió el bloque. */
function medida(dim: DimensionRaw | null | undefined, campo: keyof DimensionRaw): number | null {
  const v = dim?.[campo];
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** Dimensiones métricas de un piso o habitación, en la forma que guarda el JSONB. */
function dimensionesMetricas(dim: DimensionRaw | null | undefined) {
  return {
    area_piso_m2:          medida(dim, 'areaFloor'),
    area_piso_interior_m2: medida(dim, 'areaFloorIndoor'),
    volumen_m3:            medida(dim, 'volume'),
    alto_m:                medida(dim, 'height'),
    ancho_m:               medida(dim, 'width'),
    profundidad_m:         medida(dim, 'depth'),
  };
}

function numeroONull(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function textoONull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Convierte la respuesta de Matterport en una fila de `matterport_modelo`. */
function aFila(
  expedienteId: string,
  modelId:      string,
  urlTour:      string,
  m:            ModelRaw,
  usuarioId:    string,
): Record<string, unknown> {
  const dim   = m.dimensions ?? null;
  const calle = (m.address?.streetAddressLines ?? [])
    .filter((l): l is string => typeof l === 'string' && !!l.trim())
    .join(', ');

  const pisos = (m.floors ?? [])
    .filter((f): f is FloorRaw => !!f)
    .map(f => ({
      id:          f.id,
      etiqueta:    textoONull(f.label),
      secuencia:   typeof f.sequence === 'number' ? f.sequence : null,
      ...dimensionesMetricas(f.dimensions),
    }))
    .sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0));

  const habitaciones = (m.rooms ?? [])
    .filter((r): r is RoomRaw => !!r)
    .map(r => ({
      id:              r.id,
      etiqueta:        textoONull(r.label),
      // `tags` son los clasificadores que genera Cortex (kitchen, bathroom…):
      // permiten reconocer el tipo de estancia aunque nadie la haya nombrado.
      tags:            (r.tags ?? []).filter((t): t is string => typeof t === 'string' && !!t),
      piso_id:         r.floor?.id ?? null,
      piso_etiqueta:   textoONull(r.floor?.label),
      piso_secuencia:  typeof r.floor?.sequence === 'number' ? r.floor.sequence : null,
      ...dimensionesMetricas(r.dimensions),
    }))
    .sort((a, b) =>
      (a.piso_secuencia ?? 0) - (b.piso_secuencia ?? 0) ||
      (a.etiqueta ?? '').localeCompare(b.etiqueta ?? ''),
    );

  return {
    expediente_id: expedienteId,
    model_id:      modelId,
    url_tour:      urlTour,

    nombre:      textoONull(m.name),
    descripcion: textoONull(m.description),
    estado:      textoONull(m.state),
    visibilidad: textoONull(m.visibility),

    direccion:     textoONull(m.address?.address) ?? textoONull(m.publication?.address),
    calle:         textoONull(calle),
    ciudad:        textoONull(m.address?.locality),
    region:        textoONull(m.address?.administrativeArea),
    codigo_postal: textoONull(m.address?.postalCode),
    pais:          textoONull(m.address?.countryName) ?? textoONull(m.address?.countryCode),
    latitud:       numeroONull(m.geolocation?.lat),
    longitud:      numeroONull(m.geolocation?.long),

    area_piso_m2:          medida(dim, 'areaFloor'),
    area_piso_interior_m2: medida(dim, 'areaFloorIndoor'),
    area_pared_m2:         medida(dim, 'areaWall'),
    area_techo_m2:         medida(dim, 'areaCeiling'),
    volumen_m3:            medida(dim, 'volume'),
    alto_m:                medida(dim, 'height'),
    ancho_m:               medida(dim, 'width'),
    profundidad_m:         medida(dim, 'depth'),

    area_piso_ft2:          medida(m.imperial, 'areaFloor'),
    area_piso_interior_ft2: medida(m.imperial, 'areaFloorIndoor'),

    total_pisos:        pisos.length,
    total_habitaciones: habitaciones.length,
    pisos,
    habitaciones,

    // `image.url` puede caducar (`validUntil`); la interfaz cae a la miniatura
    // pública del player cuando no sirve.
    imagen_url:      textoONull(m.image?.url),
    share_url:       textoONull(m.publication?.url),
    publicado:       typeof m.publication?.published === 'boolean' ? m.publication.published : null,
    resumen_publico: textoONull(m.publication?.summary),

    creado_matterport:     textoONull(m.created),
    modificado_matterport: textoONull(m.modified),
    datos_crudos:          m,
    sincronizado_en:       new Date().toISOString(),
    sincronizado_por:      usuarioId,
  };
}

// ── Respuestas ───────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Error con código estable. `code` es lo único que el frontend debe mostrar
 * (lo traduce a los tres idiomas); `error` se conserva por compatibilidad y
 * para los logs, pero está solo en español y no debe llegar a la interfaz.
 */
function fail(code: string, mensaje: string, status: number, detail?: string): Response {
  // El detalle no llega al navegador traducido: si no se registra aquí, un fallo
  // de Matterport es indepurable desde fuera.
  console.error(`[matterport-sync] ${code} (${status})${detail ? ': ' + detail : ''}`);
  return json(detail ? { code, error: mensaje, detail } : { code, error: mensaje }, status);
}
