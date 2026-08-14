// Envía por correo la invitación de un expediente a constructores
// seleccionados y registra las invitaciones en expediente_invitacion.
// La invocan el administrador y el estimador (que invita desde el expediente
// que acaba de estimar). El correo se envía vía Resend
// (secreto RESEND_API_KEY); el remitente es INVITACION_FROM_EMAIL o el
// valor por defecto emiliopastora@estimation3d.com (el dominio debe estar
// verificado en Resend).
//
// Se manda UN correo por constructor, redactado en su `perfil.idioma`
// (fr | en | es), con sus datos de acceso y la ficha del expediente.
//
// La contraseña guardada no se puede leer (está hasheada en auth.users). Si
// quien invita escribe una en `passwords[constructor_id]`, esta función la
// *fija* — nunca genera una temporal, igual que `enviar-credenciales` — y solo
// después de que Resend confirme el envío. Si no la escribe, el correo no lleva
// contraseña y el constructor entra con la suya de siempre.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL    = 'https://estimation3d.vercel.app/';
const FROM_EMAIL = Deno.env.get('INVITACION_FROM_EMAIL') ?? 'emiliopastora@estimation3d.com';
// Mientras el dominio del remitente no esté verificado en Resend, se reintenta
// con el remitente de pruebas de Resend (solo entrega al dueño de la cuenta).
const FALLBACK_FROM = 'onboarding@resend.dev';

type Idioma = 'fr' | 'en' | 'es';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return fail('no_autorizado', 'No autorizado', 401);
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verificar el JWT y el rol (administrador o estimador)
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
    const { expediente_id, constructor_ids, passwords } = await req.json();
    if (!expediente_id || !Array.isArray(constructor_ids) || constructor_ids.length === 0) {
      return fail('campos_requeridos', 'Campos requeridos: expediente_id, constructor_ids[]', 400);
    }
    const claves: Record<string, string> =
      passwords && typeof passwords === 'object' ? passwords : {};

    // 3. Datos del expediente
    const { data: exp, error: expError } = await adminClient
      .from('expediente')
      .select('id, numero, estado, fecha_visita, descripcion, cliente_id, estimador_id, servicio_id')
      .eq('id', expediente_id)
      .single();
    if (expError || !exp) {
      return fail('expediente_no_encontrado', 'Expediente no encontrado', 404);
    }
    // Solo se invita a ofertar sobre un servicio ya estimado.
    if (!ESTADOS_INVITABLES.includes(exp.estado)) {
      return fail('expediente_no_estimado', 'El expediente debe estar estimado antes de invitar constructores', 400);
    }

    const [servicioRes, clienteRes, locRes, estimacionRes] = await Promise.all([
      adminClient.from('servicio').select('nombre_es, nombre_fr, nombre_en').eq('id', exp.servicio_id).single(),
      adminClient.from('perfil').select('nombre, apellido, telefono').eq('id', exp.cliente_id).single(),
      adminClient.from('localizacion').select('direccion, provincia, canton, distrito').eq('expediente_id', exp.id).maybeSingle(),
      adminClient.from('estimacion').select('fecha_visita_real, descripcion_problemas').eq('expediente_id', exp.id).maybeSingle(),
    ]);

    let estimadorNombre = '—';
    if (exp.estimador_id) {
      const { data: est } = await adminClient
        .from('perfil').select('nombre, apellido').eq('id', exp.estimador_id).single();
      if (est) estimadorNombre = `${est.nombre} ${est.apellido}`;
    }

    // 4. Constructores destino (solo rol constructor con correo)
    const { data: constructores, error: consError } = await adminClient
      .from('perfil')
      .select('id, nombre, apellido, email, idioma, proveedor')
      .in('id', constructor_ids)
      .eq('rol', 'constructor');
    if (consError) return fail('error_interno', consError.message, 500, consError.message);

    const destinatarios = (constructores ?? []).filter((c) => !!c.email);
    if (!destinatarios.length) {
      return fail('sin_correo', 'Ninguno de los constructores seleccionados tiene correo registrado', 400);
    }

    // 5. Validar las contraseñas escritas ANTES de mandar nada: si una es
    // inválida, quien invita la corrige y reintenta el lote completo.
    for (const c of destinatarios) {
      const clave = String(claves[c.id] ?? '');
      if (!clave) continue;
      if (clave.length < 8) {
        return fail('password_corta', 'La contraseña debe tener al menos 8 caracteres', 400);
      }
      // Una cuenta de Google no entra con contraseña: mandarle una sería mentirle.
      if (c.proveedor !== 'email') {
        return fail('proveedor_no_email', 'La cuenta inicia sesión con Google, no con contraseña', 400);
      }
    }

    // 6. Registrar invitaciones nuevas (cada una se revierte si su correo falla)
    const { data: existentes } = await adminClient
      .from('expediente_invitacion')
      .select('constructor_id')
      .eq('expediente_id', exp.id)
      .in('constructor_id', destinatarios.map((c) => c.id));
    const yaInvitados = new Set((existentes ?? []).map((r) => r.constructor_id));
    const nuevas = destinatarios.filter((c) => !yaInvitados.has(c.id));

    if (nuevas.length) {
      const { error: insError } = await adminClient
        .from('expediente_invitacion')
        .insert(nuevas.map((c) => ({
          expediente_id:  exp.id,
          constructor_id: c.id,
          invitado_por:   user.id,
        })));
      if (insError) return fail('error_interno', insError.message, 500, insError.message);
    }

    const nuevasIds = new Set(nuevas.map((c) => c.id));
    const rollback = async (ids: string[]) => {
      const aBorrar = ids.filter((id) => nuevasIds.has(id));
      if (!aBorrar.length) return;
      await adminClient
        .from('expediente_invitacion')
        .delete()
        .eq('expediente_id', exp.id)
        .in('constructor_id', aBorrar);
    };

    // 7. Enviar
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      await rollback([...nuevasIds]);
      return fail('resend_no_configurado', 'Falta configurar el secreto RESEND_API_KEY en Supabase', 500);
    }

    const cliente = clienteRes.data;
    const loc     = locRes.data;
    const estim   = estimacionRes.data;
    const direccion = loc
      ? [loc.direccion, loc.canton, loc.provincia, loc.distrito].filter(Boolean).join(', ')
      : '—';

    // El remitente se decide una vez: si Resend rechaza el propio dominio con un
    // 403, los correos que faltan salen ya con el de pruebas.
    let remitente = FROM_EMAIL;

    const enviarCorreo = (from: string, para: string, asunto: string, html: string) =>
      fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from:     `Estimation3D <${from}>`,
          to:       [para],
          reply_to: FROM_EMAIL,
          subject:  asunto,
          html,
        }),
      });

    const enviados: string[] = [];
    const fallidos: { constructor_id: string; detalle: string }[] = [];

    for (const c of destinatarios) {
      const idioma = normalizarIdioma(c.idioma);
      const t      = TEXTOS[idioma];
      const clave  = String(claves[c.id] ?? '');

      const html = correoHtml(idioma, {
        nombre:        `${c.nombre ?? ''} ${c.apellido ?? ''}`.trim() || c.email!,
        email:         c.email!,
        password:      clave,
        numero:        exp.numero,
        servicio:      nombreServicio(servicioRes.data, idioma),
        clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : '—',
        direccion,
        visitaFecha:   fmtFecha(exp.fecha_visita, idioma),
        visitaHora:    fmtHora(exp.fecha_visita, idioma),
        descripcion:   exp.descripcion || '—',
        estimadorNombre,
        problemas:     estim?.descripcion_problemas || '—',
      });

      let res = await enviarCorreo(remitente, c.email!, t.asunto, html);

      if (!res.ok) {
        const primerError = await res.json().catch(() => ({}));
        const primerMsg   = primerError?.message ?? `HTTP ${res.status}`;
        console.error(`[enviar-invitacion] Resend rechazó ${remitente} → ${c.email}: ${res.status} ${primerMsg}`);

        if (res.status === 403 && remitente !== FALLBACK_FROM) {
          res = await enviarCorreo(FALLBACK_FROM, c.email!, t.asunto, html);
          if (res.ok) {
            remitente = FALLBACK_FROM;
          } else {
            const payload    = await res.json().catch(() => ({}));
            const segundoMsg = payload?.message ?? `HTTP ${res.status}`;
            console.error(`[enviar-invitacion] Resend rechazó ${FALLBACK_FROM} → ${c.email}: ${res.status} ${segundoMsg}`);
            fallidos.push({ constructor_id: c.id, detalle: `${FROM_EMAIL}: ${primerMsg} — ${FALLBACK_FROM}: ${segundoMsg}` });
            continue;
          }
        } else {
          fallidos.push({ constructor_id: c.id, detalle: primerMsg });
          continue;
        }
      }

      // El correo salió: recién ahora se aplica la contraseña anunciada. Si se
      // aplicara antes y el envío fallara, el constructor se quedaría con una
      // contraseña que nadie le mandó y sin poder entrar.
      if (clave) {
        const { error: updError } = await adminClient.auth.admin.updateUserById(c.id, { password: clave });
        if (updError) {
          console.error(`[enviar-invitacion] correo enviado a ${c.email} pero updateUserById falló: ${updError.message}`);
          fallidos.push({ constructor_id: c.id, detalle: updError.message });
          continue;
        }
      }

      enviados.push(c.id);
    }

    // Las invitaciones nuevas cuyo correo no salió no deben dar acceso.
    await rollback(fallidos.map((f) => f.constructor_id));

    if (!enviados.length) {
      const detalle = fallidos[0]?.detalle ?? 'Error desconocido';
      return fail('envio_fallido', `No se pudo enviar el correo: ${detalle}`, 502, detalle);
    }

    return json({
      enviados:         enviados.length,
      fallidos:         fallidos.length,
      invitados_nuevos: enviados.filter((id) => nuevasIds.has(id)).length,
      remitente,
      errores:          fallidos,
    }, 200);

  } catch (err: any) {
    return fail('error_interno', err?.message ?? 'Error interno', 500, err?.message);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const ESTADOS_INVITABLES = ['estimado', 'en_oferta', 'adjudicado', 'contratado'];

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

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizarIdioma(v: unknown): Idioma {
  return v === 'en' || v === 'es' ? v : 'fr';
}

const LOCALES: Record<Idioma, string> = { es: 'es-CA', fr: 'fr-CA', en: 'en-CA' };

function nombreServicio(s: { nombre_es: string; nombre_fr: string; nombre_en: string } | null, idioma: Idioma): string {
  if (!s) return '—';
  if (idioma === 'fr') return s.nombre_fr || s.nombre_es;
  if (idioma === 'en') return s.nombre_en || s.nombre_es;
  return s.nombre_es;
}

function fmtFecha(iso: string | null, idioma: Idioma): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[idioma], {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto',
  }).format(d);
}

function fmtHora(iso: string | null, idioma: Idioma): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[idioma], {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto',
  }).format(d);
}

// ── Textos por idioma ────────────────────────────────────────────────────────

interface Textos {
  lang:           string;
  asunto:         string;
  titulo:         string;
  saludo:         (nombre: string) => string;
  intro:          string;
  accesoTitulo:   string;
  etqUsuario:     string;
  etqPassword:    string;
  etqUrl:         string;
  passwordActual: string;
  cta:            string;
  expTitulo:      string;
  etqNumero:      string;
  etqServicio:    string;
  etqCliente:     string;
  etqDireccion:   string;
  etqVisita:      string;
  etqDescripcion: string;
  etqEstimador:   string;
  etqProblemas:   string;
  aviso:          string;
  firma:          string;
}

const TEXTOS: Record<Idioma, Textos> = {
  es: {
    lang:           'es',
    asunto:         'Estimation3D, Servicio del expediente.',
    titulo:         'Invitación a ofertar',
    saludo:         (n) => `Hola ${n},`,
    intro:          'Le invitamos a presentar una oferta para el siguiente servicio ya estimado. Entre en Estimation3D para consultarlo y ofertar.',
    accesoTitulo:   'Sus datos de acceso',
    etqUsuario:     'Usuario',
    etqPassword:    'Contraseña',
    etqUrl:         'Dirección de la aplicación',
    passwordActual: 'La de siempre',
    cta:            '¡Hacer Oferta!',
    expTitulo:      'Detalles del expediente',
    etqNumero:      'Número',
    etqServicio:    'Servicio',
    etqCliente:     'Cliente',
    etqDireccion:   'Ubicación / dirección',
    etqVisita:      'Fecha de visita planificada',
    etqDescripcion: 'Descripción del cliente',
    etqEstimador:   'Estimador',
    etqProblemas:   'Problemas observados',
    aviso:          'Por seguridad, cambie su contraseña desde su perfil la primera vez que entre.',
    firma:          'Equipo Estimation3D',
  },
  fr: {
    lang:           'fr',
    asunto:         'Estimation3D, Service du dossier.',
    titulo:         'Invitation à soumissionner',
    saludo:         (n) => `Bonjour ${n},`,
    intro:          'Nous vous invitons à soumettre une offre pour le service estimé ci-dessous. Connectez-vous à Estimation3D pour le consulter et soumissionner.',
    accesoTitulo:   'Vos identifiants de connexion',
    etqUsuario:     'Utilisateur',
    etqPassword:    'Mot de passe',
    etqUrl:         'Adresse de l’application',
    passwordActual: 'Celui que vous utilisez déjà',
    cta:            'Faire une offre !',
    expTitulo:      'Détails du dossier',
    etqNumero:      'Numéro',
    etqServicio:    'Service',
    etqCliente:     'Client',
    etqDireccion:   'Emplacement / adresse',
    etqVisita:      'Date de visite planifiée',
    etqDescripcion: 'Description du client',
    etqEstimador:   'Estimateur',
    etqProblemas:   'Problèmes observés',
    aviso:          'Par sécurité, changez votre mot de passe depuis votre profil dès votre première connexion.',
    firma:          'L’équipe Estimation3D',
  },
  en: {
    lang:           'en',
    asunto:         'Estimation3D, File service.',
    titulo:         'Invitation to bid',
    saludo:         (n) => `Hello ${n},`,
    intro:          'You are invited to submit a bid for the estimated service below. Sign in to Estimation3D to review it and place your offer.',
    accesoTitulo:   'Your sign-in details',
    etqUsuario:     'Username',
    etqPassword:    'Password',
    etqUrl:         'Application address',
    passwordActual: 'Your usual one',
    cta:            'Make an offer!',
    expTitulo:      'File details',
    etqNumero:      'Number',
    etqServicio:    'Service',
    etqCliente:     'Client',
    etqDireccion:   'Location / address',
    etqVisita:      'Planned visit date',
    etqDescripcion: 'Client description',
    etqEstimador:   'Estimator',
    etqProblemas:   'Observed problems',
    aviso:          'For your security, change your password from your profile the first time you sign in.',
    firma:          'The Estimation3D team',
  },
};

interface DatosCorreo {
  nombre:          string;
  email:           string;
  /** Vacía cuando quien invita no fijó una: el constructor entra con la suya. */
  password:        string;
  numero:          string;
  servicio:        string;
  clienteNombre:   string;
  direccion:       string;
  visitaFecha:     string;
  visitaHora:      string;
  descripcion:     string;
  estimadorNombre: string;
  problemas:       string;
}

// Paleta del sistema (design.md): papel beige #F5F3EE, tarjeta crema #FBFAF6,
// tinta #1A1A1A, dorado #D4B96E, borde #E8E5DC. Serif de sistema para títulos
// (Fraunces no está disponible en clientes de correo).
function correoHtml(idioma: Idioma, d: DatosCorreo): string {
  const t = TEXTOS[idioma];

  const fila = (etiqueta: string, valor: string, mono = false) => `
    <tr>
      <td style="padding:8px 0;font-size:12px;color:#7A7770;text-transform:uppercase;letter-spacing:0.05em;vertical-align:top;width:190px;">${esc(etiqueta)}</td>
      <td style="padding:8px 0;font-size:14px;color:#1A1A1A;${mono ? "font-family:'Courier New',Courier,monospace;font-weight:bold;letter-spacing:0.03em;" : ''}">${esc(valor)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="${t.lang}">
<body style="margin:0;padding:0;background-color:#F5F3EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background-color:#FBFAF6;border:1px solid #E8E5DC;border-radius:8px;font-family:'Segoe UI','Helvetica Neue',sans-serif;">
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1A1A1A;">Estimation3D</p>
            <p style="margin:4px 0 0;font-size:13px;color:#7A7770;">${esc(t.titulo)} — ${esc(d.numero)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 12px;font-size:15px;color:#1A1A1A;">${esc(t.saludo(d.nombre))}</p>
            <p style="margin:0;font-size:14px;color:#1A1A1A;line-height:1.6;">${esc(t.intro)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#1A1A1A;">${esc(t.accesoTitulo)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background-color:#F5F3EE;border:1px solid #E8E5DC;border-radius:6px;padding:4px 20px;">
              ${fila(t.etqUsuario, d.email)}
              ${fila(t.etqPassword, d.password || t.passwordActual, !!d.password)}
              ${fila(t.etqUrl, APP_URL)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 4px;" align="center">
            <a href="${APP_URL}"
               style="display:inline-block;background-color:#D4B96E;color:#1A1A1A;text-decoration:none;font-size:15px;font-weight:600;padding:12px 36px;border-radius:6px;">
              ${esc(t.cta)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td colspan="2" style="padding:14px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#1A1A1A;border-bottom:1px solid #E8E5DC;">${esc(t.expTitulo)}</td>
              </tr>
              ${fila(t.etqNumero, d.numero)}
              ${fila(t.etqServicio, d.servicio)}
              ${fila(t.etqCliente, d.clienteNombre)}
              ${fila(t.etqDireccion, d.direccion)}
              ${fila(t.etqVisita, `${d.visitaFecha} · ${d.visitaHora}`)}
              ${fila(t.etqDescripcion, d.descripcion)}
              ${fila(t.etqEstimador, d.estimadorNombre)}
              ${fila(t.etqProblemas, d.problemas)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;">
            ${d.password ? `<p style="margin:0 0 16px;font-size:13px;color:#7A7770;line-height:1.6;">${esc(t.aviso)}</p>` : ''}
            <p style="margin:0;font-size:14px;">
              <a href="${APP_URL}" style="color:#B0964A;text-decoration:underline;">Estimation3D — ${APP_URL}</a>
            </p>
            <p style="margin:20px 0 0;font-size:14px;color:#1A1A1A;">${esc(t.firma)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #E8E5DC;">
            <p style="margin:0;font-size:12px;color:#7A7770;">${FROM_EMAIL}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
