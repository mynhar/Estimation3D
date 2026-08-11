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
//
// Fuentes de verdad de referencia inyectadas: el catálogo de imprevistos del
// servicio (imprevisto_catalogo) y las fichas normativas de Quebec
// (ficha_normativa).
//
// Escalación estructurada: el modelo puede registrar eventos internos con la
// herramienta `registrar_evento`, que se persisten en `asistente_evento` y NO
// se muestran al usuario. Responde SIEMPRE en el idioma seleccionado. El
// historial se persiste por usuario en `asistente_conversacion`.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_MENSAJES = 20;   // límite de turnos de historial aceptados
const MAX_TOOL_ITERS = 4;  // tope de vueltas del bucle de herramientas
const ROLES_PERMITIDOS = ['cliente', 'estimador', 'constructor', 'administrador'] as const;

// Tipos de evento de escalación que el asistente puede registrar.
const TIPOS_EVENTO = [
  'salud_mencionada',
  'escalada_humana',
  'caso_externo',
  'evidencia_incompleta_imprevisto',
  'imprevisto_anticipado',
  'candidato_imprevisto',
] as const;
type TipoEvento = typeof TIPOS_EVENTO[number];

type Rol = typeof ROLES_PERMITIDOS[number];
type ChatRole = 'user' | 'assistant';
interface ChatMessage { role: ChatRole; content: any }

interface Contexto {
  bloque:               string;
  referencias:          string;
  servicioNombre:       string;
  servicioDescripcion:  string;
}

interface EventoPendiente { tipo: TipoEvento; resumen: string }

// Herramienta de escalación. El resultado es interno; el usuario nunca lo ve.
const TOOL_REGISTRAR_EVENTO = {
  name: 'registrar_evento',
  description:
    'Registra un evento interno de escalación o seguimiento para el equipo Estimation3D. ' +
    'Es INTERNO: el usuario final nunca lo ve. Regístralo cuando corresponda: síntomas de ' +
    'salud (salud_mencionada), enojo o amenaza de disputa (escalada_humana), pregunta fuera ' +
    'de las fuentes de verdad (caso_externo), evidencia de un imprevisto incompleta ' +
    '(evidencia_incompleta_imprevisto), cuando anticipas un imprevisto del catálogo ' +
    '(imprevisto_anticipado), o cuando el técnico observa en sitio un imprevisto NUEVO fuera ' +
    'del catálogo, para revisión humana (candidato_imprevisto). Puedes registrar más de uno en un mismo turno.',
  input_schema: {
    type: 'object',
    properties: {
      tipo:    { type: 'string', enum: [...TIPOS_EVENTO] },
      resumen: { type: 'string', description: 'Motivo breve y factual, sin datos sensibles de salud.' },
    },
    required: ['tipo', 'resumen'],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('no_autorizado', 'No autorizado', 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return fail('servicio_no_configurado', 'Servicio no configurado (falta ANTHROPIC_API_KEY)', 500);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verificar JWT y obtener el rol.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await db.auth.getUser(token);
    if (userError || !user) return fail('token_invalido', 'Token inválido o expirado', 401);

    const { data: perfil } = await db.from('perfil').select('rol').eq('id', user.id).single();
    const rol = perfil?.rol as Rol | undefined;
    if (!rol || !ROLES_PERMITIDOS.includes(rol)) {
      return fail('rol_no_permitido', 'Acceso denegado', 403);
    }

    // 2. Validar cuerpo.
    const body = await req.json().catch(() => null);
    const expedienteId: string | undefined = body?.expedienteId;
    const lang: string = ['fr', 'es', 'en'].includes(body?.lang) ? body.lang : 'fr';
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!expedienteId) return fail('falta_expediente', 'Falta expedienteId', 400);

    const messages: ChatMessage[] = rawMessages
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .slice(-MAX_MENSAJES)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return fail('ultimo_mensaje_usuario', 'El último mensaje debe ser del usuario', 400);
    }

    // 3. Control de acceso + contexto real, según el rol.
    const contexto = await construirContexto(db, expedienteId, user.id, rol, lang);
    if (!contexto) return fail('expediente_sin_acceso', 'Expediente no encontrado o sin acceso', 404);

    // 4. Construir prompt y ejecutar el bucle con Claude (con herramientas).
    const system = buildSystemPrompt(contexto, lang, rol);
    const eventos: EventoPendiente[] = [];
    let respuesta = '…';
    let refusal = false;

    for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
      const data = await callClaude(apiKey, {
        model: MODEL,
        max_tokens: 1500,
        system,
        tools: [TOOL_REGISTRAR_EVENTO],
        messages,
      });

      if (data?.stop_reason === 'refusal') { refusal = true; break; }

      const bloques = (data?.content ?? []) as any[];
      const texto = bloques.filter((b) => b?.type === 'text').map((b) => b.text).join('\n').trim();
      const toolUses = bloques.filter((b) => b?.type === 'tool_use' && b?.name === 'registrar_evento');

      if (toolUses.length && iter < MAX_TOOL_ITERS - 1) {
        // El modelo pidió registrar eventos: acúsalos y deja que continúe.
        messages.push({ role: 'assistant', content: bloques });
        const results: any[] = [];
        for (const tu of toolUses) {
          const tipo = tu?.input?.tipo;
          const resumen = String(tu?.input?.resumen ?? '').slice(0, 1000);
          if (TIPOS_EVENTO.includes(tipo)) eventos.push({ tipo, resumen });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Evento registrado.' });
        }
        messages.push({ role: 'user', content: results });
        if (texto) respuesta = texto; // conserva texto parcial por si es la última vuelta
        continue;
      }

      if (texto) respuesta = texto;
      break;
    }

    if (refusal) return json({ reply: null, refusal: true }, 200);

    // 5. Persistir eventos de escalación (best effort; internos).
    if (eventos.length) {
      try {
        await db.from('asistente_evento').insert(
          eventos.map((e) => ({
            expediente_id: expedienteId,
            usuario_id:    user.id,
            rol,
            tipo:          e.tipo,
            resumen:       e.resumen,
          })),
        );
      } catch (e) {
        console.error('No se pudieron registrar los eventos', e);
      }
    }

    // 6. Persistir el turno (última pregunta + respuesta) para este usuario.
    try {
      const ultimaPregunta = String(messages.find((m) => m.role === 'user')?.content ?? '');
      const preguntaOriginal = rawMessages.filter((m: any) => m?.role === 'user').slice(-1)[0]?.content ?? ultimaPregunta;
      await db.from('asistente_conversacion').insert([
        { expediente_id: expedienteId, usuario_id: user.id, role: 'user',      content: String(preguntaOriginal).slice(0, 4000) },
        { expediente_id: expedienteId, usuario_id: user.id, role: 'assistant', content: respuesta },
      ]);
    } catch (e) {
      console.error('No se pudo persistir la conversación', e);
    }

    return json({ reply: respuesta }, 200);

  } catch (err: any) {
    console.error('asistente-ia', err);
    if (err?.message === 'anthropic') {
      return fail('asistente_no_disponible', 'El asistente no está disponible en este momento', 502);
    }
    return fail('error_interno', err?.message ?? 'Error interno', 500, err?.message);
  }
});

// ── Llamada a Claude ──────────────────────────────────────────────────────────

async function callClaude(apiKey: string, body: unknown): Promise<any> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('Anthropic error', resp.status, detail);
    throw new Error('anthropic');
  }
  return resp.json();
}

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
    { data: imprevistos },
    { data: fichas },
  ] = await Promise.all([
    db.from('localizacion').select('direccion, referencia, provincia, canton, distrito, tipo_inmueble').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('estimacion').select('estimador_id, fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max, notas_internas, url_tour').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('oferta').select('id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en').eq('expediente_id', expedienteId).order('precio', { ascending: true }),
    db.from('contrato').select('precio_final, garantia_anos, estado, generado_en, firmado_en, descripcion_trabajo').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('fase_servicio').select('orden, nombre_es, nombre_fr, nombre_en').eq('servicio_id', exp.servicio_id).eq('activo', true).order('orden', { ascending: true }),
    db.from('archivo').select('tipo, nombre_archivo, mime_type').eq('expediente_id', expedienteId).order('creado_en', { ascending: true }),
    db.from('imprevisto_catalogo')
      .select('codigo, titulo_fr, titulo_en, titulo_es, perfil_fr, perfil_en, perfil_es, protocolo_fr, protocolo_en, protocolo_es, requiere_aprobacion, ficha_codigo, orden')
      .eq('activo', true)
      .or(`servicio_id.is.null,servicio_id.eq.${exp.servicio_id}`)
      .order('orden', { ascending: true }),
    db.from('ficha_normativa')
      .select('codigo, titulo_fr, titulo_en, titulo_es, resumen_fr, resumen_en, resumen_es, orden')
      .eq('activo', true)
      .order('orden', { ascending: true }),
  ]);

  const listaOfertas = (ofertas ?? []) as any[];
  const tieneOferta = listaOfertas.some((o) => o.constructor_id === userId);

  // ── Control de acceso por rol ──
  // El estimador entra por dos vías, igual que la función SQL
  // fn_estimador_de_expediente que rige las políticas RLS: el expediente le está
  // asignado, o él firmó la estimación. Sin la segunda vía, un estimador que
  // estimó un expediente reasignado después perdía el asistente sobre su propio
  // trabajo aunque la aplicación sí se lo sigue mostrando.
  const esEstimadorDelExpediente =
    exp.estimador_id === userId || est?.estimador_id === userId;

  const acceso =
    rol === 'administrador' ? true :
    rol === 'cliente'       ? exp.cliente_id === userId :
    rol === 'estimador'     ? esEstimadorDelExpediente :
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

  // ── Fuentes de referencia: catálogo de imprevistos + fichas normativas ──
  const R: string[] = [];
  const impr = (imprevistos ?? []) as any[];
  if (impr.length) {
    R.push('<catalogo_imprevistos>');
    for (const it of impr) {
      R.push(`  <imprevisto codigo="${it.codigo}">`);
      R.push(`    ${pick(it, 'titulo', lang)} — Perfil: ${pick(it, 'perfil', lang)}`);
      R.push(`    Protocolo: ${pick(it, 'protocolo', lang)}`);
      R.push(`    Requiere aprobación previa del cliente: ${it.requiere_aprobacion ? 'sí' : 'no'}`);
      if (it.ficha_codigo) R.push(`    Norma relacionada: ${it.ficha_codigo}`);
      R.push('  </imprevisto>');
    }
    R.push('</catalogo_imprevistos>');
  }
  const fich = (fichas ?? []) as any[];
  if (fich.length) {
    R.push('<fichas_normativas>');
    for (const f of fich) {
      R.push(`  <ficha codigo="${f.codigo}">${pick(f, 'titulo', lang)} — ${pick(f, 'resumen', lang)}</ficha>`);
    }
    R.push('</fichas_normativas>');
  }

  // Solo el ADMINISTRADOR recibe agregados de toda la plataforma (F2/F3/F4).
  if (rol === 'administrador') {
    const agg = await construirAgregadosAdmin(db, lang);
    if (agg) R.push(agg);
  }

  return { bloque: L.join('\n'), referencias: R.join('\n'), servicioNombre, servicioDescripcion };
}

// ── Agregados de plataforma (solo administrador) ──────────────────────────────
// Métricas cross-expediente para las funciones analíticas del admin. Best-effort:
// si una consulta falla, se omite ese sub-bloque. Escala piloto (agrega en JS).
async function construirAgregadosAdmin(db: any, lang: string): Promise<string> {
  try {
    const [
      { data: exps },
      { data: eventos },
      { data: ofertas },
      { data: estimaciones },
      { data: servicios },
    ] = await Promise.all([
      db.from('expediente').select('id, numero, estado, servicio_id, actualizado_en'),
      db.from('asistente_evento').select('tipo, resuelto, expediente_id'),
      db.from('oferta').select('constructor_id, precio, expediente_id'),
      db.from('estimacion').select('expediente_id, costo_estimado, costo_estimado_max'),
      db.from('servicio').select('id, nombre_fr, nombre_en, nombre_es'),
    ]);

    const listExp = (exps ?? []) as any[];
    const listEv  = (eventos ?? []) as any[];
    const L: string[] = ['<agregados_plataforma>'];

    const servNombre = new Map<number, string>();
    for (const s of servicios ?? []) servNombre.set(s.id, pick(s, 'nombre', lang) || `Servicio ${s.id}`);

    // Funnel por estado.
    const porEstado = new Map<string, number>();
    for (const e of listExp) porEstado.set(e.estado, (porEstado.get(e.estado) ?? 0) + 1);
    const ordenEstados = ['nuevo', 'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado', 'cancelado'];
    const funnel = ordenEstados.filter(s => porEstado.has(s)).map(s => `${s}: ${porEstado.get(s)}`).join(' · ');
    L.push(`  <funnel total="${listExp.length}">${funnel || '—'}</funnel>`);

    // Expedientes estancados: no terminales sin actualizar > 14 días.
    const cutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const noTerminal = new Set(['en_estimacion', 'estimado', 'en_oferta', 'adjudicado']);
    const estancados = listExp.filter(e => noTerminal.has(e.estado) && String(e.actualizado_en ?? '') < cutoff);
    if (estancados.length) {
      const detalle = estancados.slice(0, 15).map(e => {
        const dias = Math.floor((Date.now() - new Date(e.actualizado_en).getTime()) / 86400000);
        return `${e.numero} (${e.estado}, ${dias} d)`;
      }).join(' · ');
      L.push(`  <expedientes_estancados umbral="14 dias" total="${estancados.length}">${detalle}</expedientes_estancados>`);
    } else {
      L.push('  <expedientes_estancados umbral="14 dias" total="0">Ninguno.</expedientes_estancados>');
    }

    // Eventos del asistente por tipo + pendientes.
    const porTipo = new Map<string, number>();
    let pendientes = 0;
    for (const ev of listEv) {
      porTipo.set(ev.tipo, (porTipo.get(ev.tipo) ?? 0) + 1);
      if (!ev.resuelto) pendientes++;
    }
    const tiposStr = [...porTipo.entries()].map(([t, n]) => `${t}: ${n}`).join(' · ');
    L.push(`  <eventos_asistente total="${listEv.length}" pendientes="${pendientes}">${tiposStr || '—'}</eventos_asistente>`);

    // Imprevistos por servicio (eventos relacionados con imprevistos, por servicio del expediente).
    const expIdServ = new Map<string, number>();
    for (const e of listExp) expIdServ.set(e.id, e.servicio_id);
    const tiposImprev = new Set(['candidato_imprevisto', 'imprevisto_anticipado', 'evidencia_incompleta_imprevisto']);
    const imprevPorServ = new Map<number, number>();
    for (const ev of listEv) {
      if (!tiposImprev.has(ev.tipo)) continue;
      const sid = expIdServ.get(ev.expediente_id);
      if (sid == null) continue;
      imprevPorServ.set(sid, (imprevPorServ.get(sid) ?? 0) + 1);
    }
    if (imprevPorServ.size) {
      const s = [...imprevPorServ.entries()].map(([sid, n]) => `${servNombre.get(sid) ?? sid}: ${n}`).join(' · ');
      L.push(`  <imprevistos_por_servicio>${s}</imprevistos_por_servicio>`);
    }

    // Ofertas fuera del rango estimado (por constructor).
    const rangoByExp = new Map<string, { min: number | null; max: number | null }>();
    for (const es of estimaciones ?? []) {
      rangoByExp.set(es.expediente_id, { min: es.costo_estimado, max: es.costo_estimado_max ?? es.costo_estimado });
    }
    const fueraPorConstructor = new Map<string, number>();
    let fueraTotal = 0;
    for (const o of ofertas ?? []) {
      const r = rangoByExp.get(o.expediente_id);
      if (!r || r.min == null) continue;
      const max = r.max ?? r.min;
      if (o.precio < r.min || o.precio > max) {
        fueraTotal++;
        fueraPorConstructor.set(o.constructor_id, (fueraPorConstructor.get(o.constructor_id) ?? 0) + 1);
      }
    }
    if (fueraTotal) {
      const ids = [...fueraPorConstructor.keys()];
      const { data: perfiles } = await db.from('perfil').select('id, nombre, apellido').in('id', ids);
      const nom = new Map<string, string>();
      for (const p of perfiles ?? []) nom.set(p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || 'Constructor');
      const s = [...fueraPorConstructor.entries()].map(([id, n]) => `${nom.get(id) ?? 'Constructor'}: ${n}`).join(' · ');
      L.push(`  <ofertas_fuera_de_rango total="${fueraTotal}" nota="comparadas contra el rango costo_estimado del estimador">${s}</ofertas_fuera_de_rango>`);
    } else {
      L.push('  <ofertas_fuera_de_rango total="0">Ninguna oferta fuera del rango estimado.</ofertas_fuera_de_rango>');
    }

    L.push('</agregados_plataforma>');
    return L.join('\n');
  } catch (e) {
    console.error('agregados admin', e);
    return '';
  }
}

// ── System prompt: persona y reglas según el rol ──────────────────────────────

interface Persona { intro: string; extra: string }

function personaPorRol(rol: Rol, servicioNombre: string): Persona {
  switch (rol) {
    case 'estimador':
      return {
        intro: `un asistente técnico de campo para el ESTIMADOR de Estimation3D, en el servicio "${servicioNombre}". Asistes al técnico durante su visita ÚNICA al sitio. Tu misión es una sola: que salga con el 100% de los datos que el expediente necesita — una segunda visita es un fracaso del sistema.`,
        extra: [
          '- ESTILO: pensado para el peor día del técnico (frío, cansancio, cliente ansioso mirando por encima del hombro). Frases cortas, UNA instrucción a la vez, cero teoría.',
          '- F1 · CHECKLIST DINÁMICO: propón el checklist del servicio y adáptalo con las señales disponibles del expediente (tipo de inmueble, zona, descripción/síntomas del cliente, diagnóstico). Apóyate en el <catalogo_imprevistos> para anticipar ítems. Ej.: inmueble antiguo + entretoit → ítem obligatorio « photo + échantillon isolant (vermiculite possible) ».',
          '- F2 · GATE DE SALIDA: antes de dar la visita por finalizada, verifica ítem por ítem (scan por zona, fotos de referencia, lecturas de humedad, observaciones). Si falta algo, entrega la lista explícita de faltantes y dónde capturarlos. El gate no se salta sin una razón escrita.',
          '- F3 · IMPREVISTO NUEVO: si el técnico observa algo fuera del catálogo, guíalo por el schema {desencadenante observable, servicio afectado, superficie/medida, impacto estimado (días/alcance), fotos, protocolo sugerido} y registra el evento candidato_imprevisto para revisión humana. NUNCA lo agregas al catálogo tú mismo.',
          '- F4 · CLASIFICACIÓN BORRADOR: propón la clasificación de zonas (tipo, riesgo bajo/medio/alto) SIEMPRE marcada como BORRADOR; el técnico confirma o corrige cada zona. Nada sale al expediente sin confirmación humana.',
          '- AMIANTO (límite reforzado): ante material sospechoso de amianto tu único output es « Se requiere muestra de laboratorio » + añadir el ítem al checklist. Jamás digas « esto parece / no parece amianto ».',
          '- Puedes usar las notas internas del expediente.',
        ].join('\n'),
      };
    case 'constructor':
      return {
        intro: `un asistente para el CONSTRUCTOR (contratista) en Estimation3D, en el servicio "${servicioNombre}". Tu propósito es hacerlo MÁS RÁPIDO y MÁS CONFORME, nunca más competitivo frente a sus pares. Móvil-primero: respuestas compactas y escaneables.`,
        extra: [
          '- F1 · PRE-COTIZACIÓN ESTRUCTURADA: a partir del expediente, organiza superficies, volúmenes y partidas por servicio. Usa solo las cifras presentes; no inventes medidas.',
          '- F2 · CHECKLIST NORMATIVO del proyecto (CNESST / Loi R-20 / RBQ según el servicio), pre-llenado desde el expediente y apoyado en las <fichas_normativas>.',
          '- F3 · ESTADÍSTICA DE IMPREVISTOS del perfil del proyecto, generada del <catalogo_imprevistos> — es LA MISMA para los tres contratistas invitados. Permite tarificar el riesgo en vez de descubrirlo en obra.',
          '- F4 · FORMATEO DE LA OFERTA al estándar de la plataforma (para comparabilidad), sin sugerir importes.',
          '- Solo ves los datos públicos del expediente y tu propia oferta; NO conoces las ofertas ni los precios de otros constructores.',
          '- PROHIBICIONES ABSOLUTAS: nada de precios, ofertas o identidad de otros contratistas; nada de consejos para "ganar" la licitación; nada de sugerencias de ajuste de precio; ningún dato del cliente fuera del expediente.',
        ].join('\n'),
      };
    case 'administrador':
      return {
        intro: `un asistente OPERATIVO para el ADMINISTRADOR de Estimation3D. Eres ojos, no manos: analizas; NUNCA ejecutas transiciones de estado ni decisiones de expediente. Tienes visión completa del expediente.`,
        extra: [
          '- F1 · QC PRE-PUBLICACIÓN: revisa el expediente en busca de data faltante, inconsistencias y fotos sin zona asignada. Propón un bloqueo si corresponde — el humano decide.',
          '- F2 · AGREGACIÓN DE IMPREVISTOS: a partir del <catalogo_imprevistos> y los datos presentes, resume frecuencia por servicio, perfil de edificio y costo/día promedio (embrión del modelo actuarial). No inventes cifras que no estén en el contexto.',
          '- F3 · ANOMALÍAS: señala expedientes estancados por fase, contratistas sistemáticamente fuera de rango y posibles señales de canal lateral cliente-contratista.',
          '- F4 · MÉTRICAS DEL PILOTO: cuando haya datos, resume conversión por etapa del funnel, imprevistos capturados y validaciones tipo Mom Test (depósitos y referidos, no elogios).',
          '- FUENTE PARA F2–F4: usa el bloque <agregados_plataforma> del contexto (funnel por estado, expedientes estancados, eventos del asistente por tipo, imprevistos por servicio, ofertas fuera de rango). Son métricas reales de toda la plataforma; no inventes las que no estén ahí (los depósitos/referidos del Mom Test aún no se capturan).',
          '- Sé objetivo y orientado a la gestión: propón próximos pasos, no dispongas. Si un agregado requiere datos que no están en el contexto, dilo con claridad.',
        ].join('\n'),
      };
    case 'cliente':
    default:
      return {
        intro: `un consultor y agente del sistema Estimation3D, una plataforma de evaluación NEUTRAL para trabajos especializados, en el servicio "${servicioNombre}". Acompañas a un PROPIETARIO (el Cliente), que NO es profesional de la construcción y suele llegar con miedo (la salud de su familia, el valor de su casa, un costo desconocido) y con desconfianza.`,
        extra: [
          '- REGLA DE ORO EMOCIONAL: la emoción se atiende ANTES que la técnica. Nunca respondas una pregunta cargada de miedo con datos primero. Secuencia obligatoria: (1) reconoce la preocupación en una frase; (2) da la información del dossier que la contextualiza; (3) indica el próximo paso concreto del proceso.',
          '- TRADUCIR EL DOSSIER: convierte superficie, nivel de riesgo y semáforo en consecuencias comprensibles — qué significa para el uso de la vivienda, para la reventa y para el seguro. Prohibido el jargon sin traducción inmediata.',
          '- ANTICIPAR IMPREVISTOS: si el perfil del expediente coincide con un imprevisto del <catalogo_imprevistos>, explícalo ANTES de que ocurra, cómo se documenta y que nada avanza sin la aprobación escrita del cliente; registra el evento imprevisto_anticipado. El objetivo: que, si llega, lo reconozca en vez de sentirse estafado. No inventes imprevistos fuera del catálogo o del expediente.',
          '- LEGITIMAR (O NO) UN PRESUPUESTO ADICIONAL: si hay un imprevisto activo, explica su legitimidad SOLO con la evidencia adjunta (foto, superficie documentada, protocolo del catálogo, requisito de aprobación previa). Si la evidencia está incompleta, NO lo defiendas: dilo con claridad, aclara que el equipo lo verificará antes de que el cliente decida y registra el evento evidencia_incompleta_imprevisto.',
          '- INTERPRETAR LAS OFERTAS SIN RECOMENDAR: explica POR QUÉ difieren (alcance, plazo, garantía, condiciones). Puedes señalar si una oferta está dentro o fuera del rango de mercado, pero solo si ese dato ya existe en el contexto. Frases PROHIBIDAS: "recomiendo", "la mejor opción", "en su situación", "yo elegiría". Frase permitida: "Aquí le explico qué distingue a cada propuesta; la decisión es suya."',
        ].join('\n'),
      };
  }
}

// Límites y principios que rigen a los cuatro roles por igual.
const REGLAS_COMUNES = `- FUENTE DE VERDAD: responde solo con lo presente en el contexto — los datos del
  expediente, el <catalogo_imprevistos> y las <fichas_normativas>. Si la información no está,
  dilo explícitamente; nunca inventes medidas, precios, plazos, cláusulas ni normativa.
- NEUTRALIDAD (inviolable): nunca recomiendas un contratista, una oferta ni un precio;
  nunca revelas a un actor la información de otro; no te presentes como mediador ni árbitro
  de disputas. Tu función es que todas las partes vean la MISMA información con la misma claridad.
- NO EJECUTAS ACCIONES: no cambias el estado del expediente ni tomas decisiones; propones y
  explicas — el sistema y las personas deciden.
- LÍMITE · SALUD: cero diagnóstico de salud. Si alguien describe síntomas, recomiéndale
  consultar a un profesional de salud y registra el evento salud_mencionada.
- LÍMITE · AMIANTO: cero identificación visual de amianto. El amianto exige análisis de
  laboratorio acreditado; tu única respuesta posible es que se requiere una muestra/análisis.
- LÍMITE · LEGAL Y SEGUROS: cero asesoría legal o de seguros. Puedes citar qué exige una
  norma documentada (fichas normativas), pero no interpretas los derechos ni las obligaciones de una persona.
- LÍMITE · PRECIO: cero promesas de precio final; solo rangos del dossier, identificados
  como referencia de mercado.
- EVENTOS INTERNOS: cuando la situación lo exija, regístrala con la herramienta
  \`registrar_evento\` — salud (salud_mencionada), enojo o amenaza de disputa (escalada_humana),
  pregunta fuera de las fuentes de verdad (caso_externo), evidencia de imprevisto incompleta
  (evidencia_incompleta_imprevisto), imprevisto anticipado del catálogo (imprevisto_anticipado)
  o imprevisto NUEVO observado en sitio (candidato_imprevisto).
  Es INTERNO para el equipo: NUNCA menciones al usuario que registras un evento ni escribas
  códigos "EVENT:" en tu respuesta.`;

function buildSystemPrompt(ctx: Contexto, lang: string, rol: Rol): string {
  const idioma = lang === 'es' ? 'español' : lang === 'en' ? 'inglés' : 'francés';
  const p = personaPorRol(rol, ctx.servicioNombre);
  const especialidad = ctx.servicioDescripcion
    ? `Especialidad del servicio (úsala para orientar tu asesoría): ${ctx.servicioDescripcion}`
    : '';
  const referencias = ctx.referencias
    ? `Fuentes de referencia (catálogo de imprevistos del servicio y fichas normativas de Quebec). Cítalas solo cuando apliquen; no interpretes obligaciones legales:\n\n${ctx.referencias}\n\n`
    : '';

  return `Eres el Asistente Estimation3D, ${p.intro}
${especialidad}

Reglas:
${p.extra}
${REGLAS_COMUNES}
- Para cifras (precios, plazos, ahorros) usa exactamente las del expediente. No calcules
  montos nuevos "de cabeza": usa solo las cifras y los agregados ya presentes.
- Adjuntos: el expediente puede incluir tours 3D (Matterport), fotos, videos y documentos,
  listados en <adjuntos>. Puedes indicar su existencia y cantidad y orientar sobre ellos,
  pero NO puedes ver su contenido visual: si preguntan por detalles visuales, acláralo e
  invita a revisarlos en el expediente.
- Vulgariza el jargon técnico y legal en lenguaje simple cuando ayude.
- Idioma: comprende la pregunta en cualquier idioma, pero responde SIEMPRE en ${idioma},
  con registro claro y sin jerga.
- Tono: claro, conciso y profesional. Usa viñetas cuando ayuden a comparar.

${referencias}Estos son los datos reales del expediente:

${ctx.bloque}`;
}

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
  return json(detail ? { code, error: mensaje, detail } : { code, error: mensaje }, status);
}
