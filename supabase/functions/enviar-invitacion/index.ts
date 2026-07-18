// Envía por correo la invitación de un expediente a constructores
// seleccionados y registra las invitaciones en expediente_invitacion.
// Solo el administrador puede invocarla. El correo se envía vía Resend
// (secreto RESEND_API_KEY); el remitente es INVITACION_FROM_EMAIL o el
// valor por defecto emiliopastora@hygienaction.com (el dominio debe estar
// verificado en Resend).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL    = 'https://estimation3d.vercel.app/';
const FROM_EMAIL = Deno.env.get('INVITACION_FROM_EMAIL') ?? 'emiliopastora@hygienaction.com';
// Mientras el dominio del remitente no esté verificado en Resend, se reintenta
// con el remitente de pruebas de Resend (solo entrega al dueño de la cuenta).
const FALLBACK_FROM = 'onboarding@resend.dev';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401);
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verificar el JWT y el rol administrador
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return json({ error: 'Token inválido o expirado' }, 401);
    }

    const { data: perfil } = await adminClient
      .from('perfil').select('rol').eq('id', user.id).single();
    if (perfil?.rol !== 'administrador') {
      return json({ error: 'Acceso denegado: se requiere rol administrador' }, 403);
    }

    // 2. Cuerpo
    const { expediente_id, constructor_ids } = await req.json();
    if (!expediente_id || !Array.isArray(constructor_ids) || constructor_ids.length === 0) {
      return json({ error: 'Campos requeridos: expediente_id, constructor_ids[]' }, 400);
    }

    // 3. Datos del expediente
    const { data: exp, error: expError } = await adminClient
      .from('expediente')
      .select('id, numero, fecha_visita, cliente_id, estimador_id, servicio_id')
      .eq('id', expediente_id)
      .single();
    if (expError || !exp) {
      return json({ error: 'Expediente no encontrado' }, 404);
    }

    const [servicioRes, clienteRes, locRes, estimacionRes] = await Promise.all([
      adminClient.from('servicio').select('nombre_es').eq('id', exp.servicio_id).single(),
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
      .select('id, nombre, apellido, email')
      .in('id', constructor_ids)
      .eq('rol', 'constructor');
    if (consError) return json({ error: consError.message }, 500);

    const destinatarios = (constructores ?? []).filter((c) => !!c.email);
    if (!destinatarios.length) {
      return json({ error: 'Ninguno de los constructores seleccionados tiene correo registrado' }, 400);
    }

    // 5. Registrar invitaciones nuevas (se revierten si el correo falla)
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
      if (insError) return json({ error: insError.message }, 500);
    }

    const rollback = async () => {
      if (nuevas.length) {
        await adminClient
          .from('expediente_invitacion')
          .delete()
          .eq('expediente_id', exp.id)
          .in('constructor_id', nuevas.map((c) => c.id));
      }
    };

    // 6. Enviar el correo
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      await rollback();
      return json({ error: 'Falta configurar el secreto RESEND_API_KEY en Supabase' }, 500);
    }

    const cliente  = clienteRes.data;
    const loc      = locRes.data;
    const estim    = estimacionRes.data;
    const servicio = servicioRes.data?.nombre_es ?? '—';
    const direccion = loc
      ? [loc.direccion, loc.canton, loc.provincia, loc.distrito].filter(Boolean).join(', ')
      : '—';

    const html = correoHtml({
      numero:          exp.numero,
      servicio,
      clienteNombre:   cliente ? `${cliente.nombre} ${cliente.apellido}` : '—',
      clienteTelefono: cliente?.telefono || '—',
      direccion,
      visitaFecha:     fmtFecha(exp.fecha_visita),
      visitaHora:      fmtHora(exp.fecha_visita),
      estimadorNombre,
      visitaRealFecha: fmtFecha(estim?.fecha_visita_real ?? null),
      visitaRealHora:  fmtHora(estim?.fecha_visita_real ?? null),
      problemas:       estim?.descripcion_problemas || '—',
    });

    const enviarCorreo = (from: string) => fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:     `Estimation3D <${from}>`,
        to:       destinatarios.map((c) => c.email),
        reply_to: FROM_EMAIL,
        subject:  `Trabajo, Estimation3D, revisar el siguiente expediente - ${exp.numero}`,
        html,
      }),
    });

    let remitente = FROM_EMAIL;
    let emailRes  = await enviarCorreo(FROM_EMAIL);

    if (!emailRes.ok) {
      const primerError = await emailRes.json().catch(() => ({}));
      const dominioNoVerificado =
        emailRes.status === 403 &&
        typeof primerError?.message === 'string' &&
        primerError.message.includes('not verified');

      if (dominioNoVerificado && FROM_EMAIL !== FALLBACK_FROM) {
        remitente = FALLBACK_FROM;
        emailRes  = await enviarCorreo(FALLBACK_FROM);
        if (!emailRes.ok) {
          await rollback();
          const payload = await emailRes.json().catch(() => ({}));
          return json({ error: `No se pudo enviar el correo: ${payload?.message ?? `HTTP ${emailRes.status}`}` }, 502);
        }
      } else {
        await rollback();
        return json({ error: `No se pudo enviar el correo: ${primerError?.message ?? `HTTP ${emailRes.status}`}` }, 502);
      }
    }

    return json({ enviados: destinatarios.length, invitados_nuevos: nuevas.length, remitente }, 200);

  } catch (err: any) {
    return json({ error: err?.message ?? 'Error interno' }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Costa_Rica',
  }).format(d);
}

function fmtHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica',
  }).format(d);
}

interface DatosCorreo {
  numero:          string;
  servicio:        string;
  clienteNombre:   string;
  clienteTelefono: string;
  direccion:       string;
  visitaFecha:     string;
  visitaHora:      string;
  estimadorNombre: string;
  visitaRealFecha: string;
  visitaRealHora:  string;
  problemas:       string;
}

// Paleta del sistema (design.md): papel beige #F5F3EE, tarjeta crema #FBFAF6,
// tinta #1A1A1A, dorado #D4B96E, borde #E8E5DC. Serif de sistema para títulos
// (Fraunces no está disponible en clientes de correo).
function correoHtml(d: DatosCorreo): string {
  const fila = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#7A7770;text-transform:uppercase;letter-spacing:0.05em;vertical-align:top;width:190px;">${etiqueta}</td>
      <td style="padding:6px 0;font-size:14px;color:#1A1A1A;">${esc(valor)}</td>
    </tr>`;

  const seccion = (titulo: string) => `
    <tr>
      <td colspan="2" style="padding:22px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#1A1A1A;border-bottom:1px solid #E8E5DC;">${titulo}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background-color:#F5F3EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background-color:#FBFAF6;border:1px solid #E8E5DC;border-radius:8px;font-family:'Segoe UI','Helvetica Neue',sans-serif;">
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1A1A1A;">Estimation3D</p>
            <p style="margin:4px 0 0;font-size:13px;color:#7A7770;">Nueva oportunidad de trabajo — expediente ${esc(d.numero)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px;" align="center">
            <a href="${APP_URL}"
               style="display:inline-block;background-color:#D4B96E;color:#1A1A1A;text-decoration:none;font-size:15px;font-weight:600;padding:12px 36px;border-radius:6px;">
              ¡Hacer Oferta!
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${seccion('Detalles del expediente')}
              ${fila('Expediente', d.numero)}
              ${fila('Servicio', d.servicio)}
              ${fila('Cliente', d.clienteNombre)}
              ${fila('Teléfono', d.clienteTelefono)}
              ${fila('Dirección', d.direccion)}
              ${fila('Visita planificada por el cliente', `${d.visitaFecha} · ${d.visitaHora}`)}
              ${seccion('Documentación de la visita')}
              ${fila('Estimador asignado', d.estimadorNombre)}
              ${fila('Fecha y hora de la visita', `${d.visitaRealFecha} · ${d.visitaRealHora}`)}
              ${fila('Problemas observados', d.problemas)}
            </table>
            <p style="margin:24px 0 0;font-size:14px;">
              <a href="${APP_URL}" style="color:#B0964A;text-decoration:underline;">Estimation3D — ${APP_URL}</a>
            </p>
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
