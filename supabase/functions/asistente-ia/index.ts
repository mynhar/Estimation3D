import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Asistente IA Estimation3D ────────────────────────────────────────────────
// Función de borde: recibe el historial de chat + un expediente, reúne los datos
// REALES de ese expediente en el servidor y los inyecta como contexto en el
// prompt de Claude. La clave de la API vive solo aquí como secreto
// (ANTHROPIC_API_KEY); nunca en el frontend.
//
// Multi-rol: cliente, estimador, constructor y administrador. Cada rol tiene su
//   · control de acceso (qué expedientes puede consultar),
//   · contexto (qué datos ve — p. ej. el constructor no ve ofertas ajenas),
//   · persona (consultor del propietario, asistente técnico del estimador,
//     asistente del constructor, o asistente operativo del administrador).
// Responde SIEMPRE en el idioma seleccionado. El historial se persiste por
// usuario en `asistente_conversacion` (cada rol tiene su propio hilo).
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_MENSAJES = 20; // límite de turnos de historial aceptados
const ROLES_PERMITIDOS = ['cliente', 'estimador', 'constructor', 'administrador'] as const;

type Rol = typeof ROLES_PERMITIDOS[number];
type ChatRole = 'user' | 'assistant';
interface ChatMessage { role: ChatRole; content: string }

interface Contexto {
  bloque:               string;
  servicioNombre:       string;
  servicioDescripcion:  string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Servicio no configurado (falta ANTHROPIC_API_KEY)' }, 500);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verificar JWT y obtener el rol.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await db.auth.getUser(token);
    if (userError || !user) return json({ error: 'Token inválido o expirado' }, 401);

    const { data: perfil } = await db.from('perfil').select('rol').eq('id', user.id).single();
    const rol = perfil?.rol as Rol | undefined;
    if (!rol || !ROLES_PERMITIDOS.includes(rol)) {
      return json({ error: 'Acceso denegado' }, 403);
    }

    // 2. Validar cuerpo.
    const body = await req.json().catch(() => null);
    const expedienteId: string | undefined = body?.expedienteId;
    const lang: string = ['fr', 'es', 'en'].includes(body?.lang) ? body.lang : 'fr';
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!expedienteId) return json({ error: 'Falta expedienteId' }, 400);

    const messages: ChatMessage[] = rawMessages
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .slice(-MAX_MENSAJES)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'El último mensaje debe ser del usuario' }, 400);
    }

    // 3. Control de acceso + contexto real, según el rol.
    const contexto = await construirContexto(db, expedienteId, user.id, rol, lang);
    if (!contexto) return json({ error: 'Expediente no encontrado o sin acceso' }, 404);

    // 4. Construir prompt y llamar a Claude.
    const system = buildSystemPrompt(contexto, lang, rol);

    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('Anthropic error', resp.status, detail);
      return json({ error: 'El asistente no está disponible en este momento' }, 502);
    }

    const data = await resp.json();
    if (data?.stop_reason === 'refusal') {
      return json({ reply: null, refusal: true }, 200);
    }
    const reply = (data?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    const respuesta = reply || '…';

    // 5. Persistir el turno (última pregunta + respuesta) para este usuario. No
    //    debe romper la respuesta si falla el guardado.
    try {
      const ultimaPregunta = messages[messages.length - 1].content;
      await db.from('asistente_conversacion').insert([
        { expediente_id: expedienteId, usuario_id: user.id, role: 'user',      content: ultimaPregunta },
        { expediente_id: expedienteId, usuario_id: user.id, role: 'assistant', content: respuesta },
      ]);
    } catch (e) {
      console.error('No se pudo persistir la conversación', e);
    }

    return json({ reply: respuesta }, 200);

  } catch (err: any) {
    console.error('asistente-ia', err);
    return json({ error: err?.message ?? 'Error interno' }, 500);
  }
});

// ── Utilidades de formato ─────────────────────────────────────────────────────

const fmtPrecio = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

const fmtFecha = (s: string | null | undefined): string => {
  if (!s) return '—';
  return s.includes('T') ? s.split('T')[0] : s;
};

const pick = (row: any, base: string, lang: string): string =>
  row?.[`${base}_${lang}`] || row?.[`${base}_fr`] || row?.[`${base}_es`] || row?.[`${base}_en`] || '';

/** Parsea `url_tour` (lista JSON serializada o URL simple) en un arreglo. */
function parseUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
  } catch { /* no era JSON */ }
  return [raw];
}

// ── Reúne los datos del expediente (con acceso y visibilidad por rol) ─────────

async function construirContexto(
  db: any, expedienteId: string, userId: string, rol: Rol, lang: string,
): Promise<Contexto | null> {
  // Expediente + servicio con descripción (el service role bypassa RLS; el acceso
  // se valida explícitamente más abajo según el rol).
  const { data: exp } = await db
    .from('expediente')
    .select('id, numero, estado, fecha_visita, creado_en, descripcion, cliente_id, estimador_id, servicio_id, servicio:servicio_id ( nombre_es, nombre_fr, nombre_en, descripcion_es, descripcion_fr, descripcion_en )')
    .eq('id', expedienteId)
    .maybeSingle();
  if (!exp) return null;

  const [
    { data: loc },
    { data: est },
    { data: ofertas },
    { data: contrato },
    { data: fases },
    { data: archivos },
  ] = await Promise.all([
    db.from('localizacion').select('direccion, referencia, provincia, canton, distrito, tipo_inmueble').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('estimacion').select('fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max, notas_internas, url_tour').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('oferta').select('id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en').eq('expediente_id', expedienteId).order('precio', { ascending: true }),
    db.from('contrato').select('precio_final, garantia_anos, estado, generado_en, firmado_en, descripcion_trabajo').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('fase_servicio').select('orden, nombre_es, nombre_fr, nombre_en').eq('servicio_id', exp.servicio_id).eq('activo', true).order('orden', { ascending: true }),
    db.from('archivo').select('tipo, nombre_archivo, mime_type').eq('expediente_id', expedienteId).order('creado_en', { ascending: true }),
  ]);

  const listaOfertas = (ofertas ?? []) as any[];
  const tieneOferta = listaOfertas.some((o) => o.constructor_id === userId);

  // ── Control de acceso por rol ──
  const acceso =
    rol === 'administrador' ? true :
    rol === 'cliente'       ? exp.cliente_id === userId :
    rol === 'estimador'     ? exp.estimador_id === userId :
    rol === 'constructor'   ? (['estimado', 'en_oferta'].includes(exp.estado) || tieneOferta) :
    false;
  if (!acceso) return null;

  // ── Visibilidad por rol ──
  const veNotasInternas = rol === 'estimador' || rol === 'administrador';
  const veTodasOfertas  = rol !== 'constructor';
  const ofertaSuyaAceptada = listaOfertas.some((o) => o.constructor_id === userId && o.estado === 'aceptada');
  const veContrato = rol !== 'constructor' || ofertaSuyaAceptada;

  // Nombres de constructores (solo cuando se muestran todas las ofertas).
  const nombrePorId = new Map<string, string>();
  if (veTodasOfertas) {
    const constructorIds = [...new Set(listaOfertas.map((o) => o.constructor_id).filter(Boolean))];
    if (constructorIds.length) {
      const { data: perfiles } = await db.from('perfil').select('id, nombre, apellido').in('id', constructorIds);
      for (const p of perfiles ?? []) {
        nombrePorId.set(p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || 'Constructor');
      }
    }
  }

  const servicioNombre      = pick(exp.servicio, 'nombre', lang) || '—';
  const servicioDescripcion = pick(exp.servicio, 'descripcion', lang);

  // ── Construir el bloque de contexto ──
  const L: string[] = [];
  L.push('<expediente>');
  L.push(`  Número: ${exp.numero}`);
  L.push(`  Estado: ${exp.estado}`);
  L.push(`  Servicio: ${servicioNombre}`);
  if (exp.descripcion) L.push(`  Descripción del cliente: ${exp.descripcion}`);
  L.push(`  Fecha de visita programada: ${fmtFecha(exp.fecha_visita)}`);

  if (loc) {
    const ubic = [loc.direccion, loc.distrito, loc.canton, loc.provincia].filter(Boolean).join(', ');
    L.push(`  Inmueble: ${loc.tipo_inmueble ?? '—'}${ubic ? ` · ${ubic}` : ''}`);
  }

  const listaFases = (fases ?? []).map((f: any) => pick(f, 'nombre', lang)).filter(Boolean);
  if (listaFases.length) {
    L.push(`  <fases_del_servicio>${listaFases.join(' → ')}</fases_del_servicio>`);
  }

  if (est) {
    L.push('  <estimacion>');
    if (est.fecha_visita_real) L.push(`    Visita realizada: ${fmtFecha(est.fecha_visita_real)}`);
    if (est.descripcion_problemas) L.push(`    Diagnóstico del estimador: ${est.descripcion_problemas}`);
    if (est.costo_estimado != null) {
      const rango = est.costo_estimado_max != null && est.costo_estimado_max !== est.costo_estimado
        ? `${fmtPrecio(est.costo_estimado)} – ${fmtPrecio(est.costo_estimado_max)}`
        : fmtPrecio(est.costo_estimado);
      L.push(`    Costo estimado: ${rango}`);
    }
    if (veNotasInternas && est.notas_internas) {
      L.push(`    Notas internas del estimador: ${est.notas_internas}`);
    }
    L.push('  </estimacion>');
  }

  // Ofertas: todas (con nombres) o solo la del constructor.
  const ofertasVisibles = veTodasOfertas ? listaOfertas : listaOfertas.filter((o) => o.constructor_id === userId);
  if (ofertasVisibles.length) {
    L.push(`  <ofertas total="${ofertasVisibles.length}">`);
    let idx = 0;
    for (const o of ofertasVisibles) {
      idx++;
      const plazo = o.plazo_semanas_min == null ? '—'
        : o.plazo_semanas_max != null && o.plazo_semanas_max !== o.plazo_semanas_min
          ? `${o.plazo_semanas_min}–${o.plazo_semanas_max} semanas`
          : `${o.plazo_semanas_min} semanas`;
      L.push(`    <oferta n="${idx}">`);
      if (veTodasOfertas) L.push(`      Constructor: ${nombrePorId.get(o.constructor_id) ?? 'Constructor'}`);
      else                L.push(`      Constructor: (tu oferta)`);
      L.push(`      Precio: ${fmtPrecio(o.precio)}`);
      L.push(`      Plazo estimado: ${plazo}`);
      L.push(`      Garantía: ${o.garantia_anos != null ? `${o.garantia_anos} años` : '—'}`);
      if (o.fecha_inicio) L.push(`      Inicio propuesto: ${fmtFecha(o.fecha_inicio)}`);
      L.push(`      Estado: ${o.estado}`);
      if (o.descripcion) L.push(`      Descripción del trabajo: ${o.descripcion}`);
      L.push('    </oferta>');
    }
    if (veTodasOfertas) {
      const precios = ofertasVisibles.map((o) => o.precio).filter((p: any) => typeof p === 'number');
      if (precios.length > 1) {
        const min = Math.min(...precios), max = Math.max(...precios);
        L.push(`    Oferta más económica: ${fmtPrecio(min)} · más costosa: ${fmtPrecio(max)}`);
        L.push(`    Diferencia entre la más cara y la más barata: ${fmtPrecio(max - min)}`);
      }
    }
    L.push('  </ofertas>');
  } else if (veTodasOfertas) {
    L.push('  <ofertas total="0">Aún no hay ofertas de constructores.</ofertas>');
  } else {
    L.push('  <ofertas total="0">Todavía no has enviado una oferta para este expediente.</ofertas>');
  }

  // Para el constructor: cuántas ofertas compiten en total, sin revelar detalles.
  if (!veTodasOfertas && listaOfertas.length) {
    L.push(`  <competencia>Hay ${listaOfertas.length} oferta(s) en total en este expediente. No tienes acceso a las de otros constructores.</competencia>`);
  }

  if (contrato && veContrato) {
    L.push('  <contrato>');
    L.push(`    Estado: ${contrato.estado}`);
    L.push(`    Precio final: ${fmtPrecio(contrato.precio_final)}`);
    L.push(`    Garantía: ${contrato.garantia_anos != null ? `${contrato.garantia_anos} años` : '—'}`);
    if (contrato.firmado_en) L.push(`    Firmado el: ${fmtFecha(contrato.firmado_en)}`);
    if (contrato.descripcion_trabajo) L.push(`    Trabajo contratado: ${contrato.descripcion_trabajo}`);
    L.push('  </contrato>');
  }

  // ── Adjuntos: tours 3D, fotos, videos y documentos ──
  const tours = parseUrls(est?.url_tour);
  const arch = (archivos ?? []) as Array<{ tipo: string; nombre_archivo: string; mime_type: string | null }>;
  const fotos = arch.filter((a) => a.tipo === 'foto' || a.tipo === 'reporte_foto');
  const videos = arch.filter((a) => a.tipo === 'video' || a.tipo === 'reporte_video');
  const documentos = arch.filter((a) => a.tipo === 'documento' || a.tipo === 'contrato_pdf' || a.tipo === 'reporte_documento');

  if (tours.length || fotos.length || videos.length || documentos.length) {
    L.push('  <adjuntos>');
    if (tours.length) {
      L.push(`    <tours_3d total="${tours.length}">Tours virtuales Matterport del inmueble (recorridos 3D navegables).</tours_3d>`);
    }
    if (fotos.length) {
      L.push(`    <fotos total="${fotos.length}">${fotos.slice(0, 15).map((f) => f.nombre_archivo).join(', ')}</fotos>`);
    }
    if (videos.length) {
      L.push(`    <videos total="${videos.length}">${videos.slice(0, 15).map((v) => v.nombre_archivo).join(', ')}</videos>`);
    }
    if (documentos.length) {
      L.push(`    <documentos total="${documentos.length}">${documentos.slice(0, 15).map((d) => d.nombre_archivo).join(', ')}</documentos>`);
    }
    L.push('  </adjuntos>');
  } else {
    L.push('  <adjuntos>Este expediente aún no tiene fotos, videos, documentos ni tours 3D adjuntos.</adjuntos>');
  }

  L.push('</expediente>');
  return { bloque: L.join('\n'), servicioNombre, servicioDescripcion };
}

// ── System prompt: persona y reglas según el rol ──────────────────────────────

interface Persona { intro: string; extra: string }

function personaPorRol(rol: Rol, servicioNombre: string): Persona {
  switch (rol) {
    case 'estimador':
      return {
        intro: `un asistente técnico para el ESTIMADOR de Estimation3D, especializado en el servicio "${servicioNombre}". Ayudas al estimador a diagnosticar, dimensionar y estimar el costo del trabajo, y a preparar una estimación sólida y bien fundamentada.`,
        extra: `- Aporta rigor técnico: metodología de medición, partidas típicas, riesgos y supuestos a documentar para este tipo de servicio. Puedes usar las notas internas del expediente.`,
      };
    case 'constructor':
      return {
        intro: `un asistente para el CONSTRUCTOR (contratista) en Estimation3D, especializado en el servicio "${servicioNombre}". Ayudas al constructor a entender el alcance del trabajo y a preparar una oferta competitiva y realista.`,
        extra: `- Solo ves los datos públicos del expediente y tu propia oferta; NO conoces las ofertas ni los precios de otros constructores, así que no los inventes ni los deduzcas. El rango de costo estimado es una referencia orientativa del estimador.`,
      };
    case 'administrador':
      return {
        intro: `un asistente operativo para el ADMINISTRADOR de Estimation3D. Ayudas a supervisar el expediente de extremo a extremo: estado, estimación, ofertas, contrato y obra.`,
        extra: `- Tienes visión completa del expediente. Sé objetivo y orientado a la gestión: señala cuellos de botella, inconsistencias o próximos pasos.`,
      };
    case 'cliente':
    default:
      return {
        intro: `un consultor experto y agente de la plataforma Estimation3D, especializado en el servicio "${servicioNombre}". Acompañas a un PROPIETARIO a entender su expediente y a decidir sobre la renovación de su inmueble.`,
        extra: `- Actúa como consultor imparcial del propietario: al comparar ofertas muestra ventajas y desventajas de cada una, señala cuál se ajusta mejor a sus criterios con razones, sin presionar.`,
      };
  }
}

function buildSystemPrompt(ctx: Contexto, lang: string, rol: Rol): string {
  const idioma = lang === 'es' ? 'español' : lang === 'en' ? 'inglés' : 'francés';
  const p = personaPorRol(rol, ctx.servicioNombre);
  const especialidad = ctx.servicioDescripcion
    ? `Especialidad del servicio (úsala para orientar tu asesoría): ${ctx.servicioDescripcion}`
    : '';

  return `Eres el Asistente Estimation3D, ${p.intro}
${especialidad}

Reglas:
${p.extra}
- Responde ÚNICAMENTE con datos presentes en <expediente>. Si un dato no está, dilo
  claramente. NUNCA inventes precios, plazos, cláusulas ni el contenido de adjuntos.
- Para cifras (precios, plazos, ahorros) usa exactamente las del expediente. No calcules
  montos nuevos "de cabeza": usa solo las cifras y los agregados ya presentes.
- Adjuntos: el expediente puede incluir tours 3D (Matterport), fotos, videos y documentos,
  listados en <adjuntos>. Puedes indicar su existencia y cantidad y orientar sobre ellos,
  pero NO puedes ver su contenido visual: si preguntan por detalles visuales, acláralo e
  invita a revisarlos en el expediente.
- Vulgariza el jargón técnico y legal en lenguaje simple cuando ayude.
- Garantías y temas legales: explica de forma general según lo documentado, pero aclara que
  no es asesoría legal y que debe confirmarse con un profesional.
- Idioma: comprende la pregunta en cualquier idioma, pero responde SIEMPRE en ${idioma}.
- Tono: claro, conciso y profesional. Usa viñetas cuando ayuden a comparar.

Estos son los datos reales del expediente:

${ctx.bloque}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
