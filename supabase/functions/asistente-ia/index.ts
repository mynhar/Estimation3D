import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Asistente IA Estimation3D ────────────────────────────────────────────────
// Función de borde: recibe el historial de chat + un expediente del cliente,
// reúne los datos REALES de ese expediente (precios, plazos, garantías…) en el
// servidor y los inyecta como contexto en el prompt de Claude. La clave de la
// API vive solo aquí como secreto (ANTHROPIC_API_KEY); nunca en el frontend.
//
// El modelo responde ÚNICAMENTE con los datos del bloque <expediente>: no puede
// inventar cifras porque las recibe ya calculadas y formateadas.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_MENSAJES = 20; // límite de turnos de historial aceptados

type ChatRole = 'user' | 'assistant';
interface ChatMessage { role: ChatRole; content: string }

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

    // 1. Verificar JWT y rol cliente.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await db.auth.getUser(token);
    if (userError || !user) return json({ error: 'Token inválido o expirado' }, 401);

    const { data: perfil } = await db.from('perfil').select('rol').eq('id', user.id).single();
    if (perfil?.rol !== 'cliente') {
      return json({ error: 'Acceso denegado: solo clientes' }, 403);
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

    // 3. Verificar que el expediente pertenece a este cliente (RLS la bypasa el
    //    service role, así que validamos la propiedad explícitamente).
    const contexto = await construirContexto(db, expedienteId, user.id);
    if (!contexto) return json({ error: 'Expediente no encontrado' }, 404);

    // 4. Construir prompt y llamar a Claude.
    const system = buildSystemPrompt(contexto, lang);

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

    return json({ reply: reply || '…' }, 200);

  } catch (err: any) {
    console.error('asistente-ia', err);
    return json({ error: err?.message ?? 'Error interno' }, 500);
  }
});

// ── Reúne los datos del expediente y los devuelve ya formateados ──────────────

const fmtPrecio = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

const fmtFecha = (s: string | null | undefined): string => {
  if (!s) return '—';
  const raw = s.includes('T') ? s.split('T')[0] : s;
  return raw;
};

async function construirContexto(db: any, expedienteId: string, clienteId: string): Promise<string | null> {
  // Expediente (validando propiedad) + servicio.
  const { data: exp } = await db
    .from('expediente')
    .select('id, numero, estado, fecha_visita, creado_en, descripcion, servicio_id, servicio:servicio_id ( nombre_es, nombre_fr, nombre_en )')
    .eq('id', expedienteId)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (!exp) return null;

  const [{ data: loc }, { data: est }, { data: ofertas }, { data: contrato }] = await Promise.all([
    db.from('localizacion').select('direccion, referencia, provincia, canton, distrito, tipo_inmueble').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('estimacion').select('fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max').eq('expediente_id', expedienteId).maybeSingle(),
    db.from('oferta').select('id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en').eq('expediente_id', expedienteId).order('precio', { ascending: true }),
    db.from('contrato').select('precio_final, garantia_anos, estado, generado_en, firmado_en, descripcion_trabajo').eq('expediente_id', expedienteId).maybeSingle(),
  ]);

  // Nombres de constructores para las ofertas.
  const constructorIds = [...new Set((ofertas ?? []).map((o: any) => o.constructor_id).filter(Boolean))];
  const nombrePorId = new Map<string, string>();
  if (constructorIds.length) {
    const { data: perfiles } = await db.from('perfil').select('id, nombre, apellido').in('id', constructorIds);
    for (const p of perfiles ?? []) {
      nombrePorId.set(p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || 'Constructor');
    }
  }

  // ── Construir el bloque de contexto ──
  const L: string[] = [];
  L.push('<expediente>');
  L.push(`  Número: ${exp.numero}`);
  L.push(`  Estado: ${exp.estado}`);
  L.push(`  Servicio: ${exp.servicio?.nombre_fr ?? exp.servicio?.nombre_es ?? '—'}`);
  if (exp.descripcion) L.push(`  Descripción del cliente: ${exp.descripcion}`);
  L.push(`  Fecha de visita programada: ${fmtFecha(exp.fecha_visita)}`);

  if (loc) {
    const ubic = [loc.direccion, loc.distrito, loc.canton, loc.provincia].filter(Boolean).join(', ');
    L.push(`  Inmueble: ${loc.tipo_inmueble ?? '—'}${ubic ? ` · ${ubic}` : ''}`);
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
    L.push('  </estimacion>');
  }

  const lista = ofertas ?? [];
  if (lista.length) {
    L.push(`  <ofertas total="${lista.length}">`);
    let idx = 0;
    for (const o of lista) {
      idx++;
      const plazo = o.plazo_semanas_min == null ? '—'
        : o.plazo_semanas_max != null && o.plazo_semanas_max !== o.plazo_semanas_min
          ? `${o.plazo_semanas_min}–${o.plazo_semanas_max} semanas`
          : `${o.plazo_semanas_min} semanas`;
      L.push(`    <oferta n="${idx}">`);
      L.push(`      Constructor: ${nombrePorId.get(o.constructor_id) ?? 'Constructor'}`);
      L.push(`      Precio: ${fmtPrecio(o.precio)}`);
      L.push(`      Plazo estimado: ${plazo}`);
      L.push(`      Garantía: ${o.garantia_anos != null ? `${o.garantia_anos} años` : '—'}`);
      if (o.fecha_inicio) L.push(`      Inicio propuesto: ${fmtFecha(o.fecha_inicio)}`);
      L.push(`      Estado: ${o.estado}`);
      if (o.descripcion) L.push(`      Descripción del trabajo: ${o.descripcion}`);
      L.push('    </oferta>');
    }
    // Agregados calculados en el servidor (cifras exactas).
    const precios = lista.map((o: any) => o.precio).filter((p: any) => typeof p === 'number');
    if (precios.length > 1) {
      const min = Math.min(...precios), max = Math.max(...precios);
      L.push(`    Oferta más económica: ${fmtPrecio(min)} · más costosa: ${fmtPrecio(max)}`);
      L.push(`    Diferencia entre la más cara y la más barata: ${fmtPrecio(max - min)}`);
    }
    L.push('  </ofertas>');
  } else {
    L.push('  <ofertas total="0">Aún no hay ofertas de constructores.</ofertas>');
  }

  if (contrato) {
    L.push('  <contrato>');
    L.push(`    Estado: ${contrato.estado}`);
    L.push(`    Precio final: ${fmtPrecio(contrato.precio_final)}`);
    L.push(`    Garantía: ${contrato.garantia_anos != null ? `${contrato.garantia_anos} años` : '—'}`);
    if (contrato.firmado_en) L.push(`    Firmado el: ${fmtFecha(contrato.firmado_en)}`);
    if (contrato.descripcion_trabajo) L.push(`    Trabajo contratado: ${contrato.descripcion_trabajo}`);
    L.push('  </contrato>');
  }

  L.push('</expediente>');
  return L.join('\n');
}

// ── System prompt (reglas del propietario neutral) ────────────────────────────

function buildSystemPrompt(contexto: string, lang: string): string {
  const idioma = lang === 'es' ? 'español' : lang === 'en' ? 'inglés' : 'francés';
  return `Eres el Asistente Estimation3D, un asistente neutral que ayuda a un PROPIETARIO
a entender y decidir sobre la renovación de su inmueble.

Reglas:
- Responde ÚNICAMENTE con datos presentes en <expediente>. Si un dato no está,
  dilo claramente. NUNCA inventes precios, plazos ni cláusulas.
- Para cifras (precios, plazos, ahorros) usa exactamente las del expediente. No
  calcules montos nuevos "de cabeza": usa solo las cifras y los agregados ya
  presentes en <expediente>.
- Vulgariza el jargón técnico y legal en lenguaje simple.
- Garantías y temas legales: explica de forma general según lo documentado, pero
  aclara que no es asesoría legal y que debe confirmarse con el contratista o un
  profesional.
- Al comparar ofertas sé equilibrado: muestra ventajas y desventajas de cada una.
  Puedes señalar cuál se ajusta mejor a los criterios del propietario, con razones,
  sin presionar.
- Idioma: responde SIEMPRE en ${idioma}, sin importar el idioma de la pregunta.
- Tono: claro, conciso, tranquilizador. Usa viñetas cuando ayuden a comparar.

Estos son los datos reales del expediente del propietario:

${contexto}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
