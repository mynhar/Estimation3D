// Envía por correo al usuario sus credenciales de acceso a Estimation3D.
// La invocan el administrador (cualquier usuario) y el estimador (solo los dos
// roles externos que él gestiona: cliente y constructor).
//
// La contraseña actual NO se puede leer (está hasheada en auth.users), así que
// esta función *fija* la que venga en el cuerpo — obligatoria: nunca genera una
// temporal, la escribe siempre quien invita. Es decir, invocarla reinicia el
// acceso del usuario, y el frontend pide confirmación antes de llamarla.
//
// El asunto y el cuerpo se redactan en `perfil.idioma` (fr | en | es).
// El correo se envía vía Resend (secreto RESEND_API_KEY); el remitente es
// INVITACION_FROM_EMAIL o emiliopastora@estimation3d.com por defecto.

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

    // 1. Verificar el JWT y el rol de quien llama
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return fail('token_invalido', 'Token inválido o expirado', 401);
    }

    const { data: quien } = await adminClient
      .from('perfil').select('rol').eq('id', user.id).single();
    const callerRol = quien?.rol;
    if (callerRol !== 'administrador' && callerRol !== 'estimador') {
      return fail('rol_no_permitido', 'Acceso denegado: se requiere rol administrador o estimador', 403);
    }

    // 2. Cuerpo
    const { id, password } = await req.json();
    if (!id) {
      return fail('campos_requeridos', 'Campo requerido: id', 400);
    }
    // La contraseña la escribe siempre quien invita: sin ella no se envía nada.
    if (password == null || String(password).trim() === '') {
      return fail('password_requerida', 'La contraseña es obligatoria para enviar la invitación', 400);
    }
    if (String(password).length < 8) {
      return fail('password_corta', 'La contraseña debe tener al menos 8 caracteres', 400);
    }

    // 3. Destinatario
    const { data: destino, error: destinoError } = await adminClient
      .from('perfil')
      .select('id, nombre, apellido, email, idioma, proveedor, rol')
      .eq('id', id)
      .single();
    if (destinoError || !destino) {
      return fail('usuario_no_encontrado', 'Usuario no encontrado', 404);
    }
    // Invitar reinicia la contraseña: el estimador solo puede hacerlo con los
    // dos roles externos que gestiona, nunca con una cuenta interna.
    if (callerRol === 'estimador' && destino.rol !== 'cliente' && destino.rol !== 'constructor') {
      return fail('estimador_rol_no_permitido', 'Acceso denegado: el estimador solo puede gestionar usuarios con rol cliente o constructor', 403);
    }
    if (!destino.email) {
      return fail('usuario_sin_correo', 'El usuario no tiene correo registrado', 400);
    }
    // Una cuenta de Google no entra con contraseña: mandarle una sería mentirle.
    if (destino.proveedor !== 'email') {
      return fail('proveedor_no_email', 'La cuenta inicia sesión con Google, no con contraseña', 400);
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return fail('resend_no_configurado', 'Falta configurar el secreto RESEND_API_KEY en Supabase', 500);
    }

    // 4. La contraseña todavía NO se aplica: si el correo falla, el usuario se
    // quedaría con una contraseña que él no ha recibido (la anterior es
    // irrecuperable, está hasheada) y sin poder entrar. Se aplica al final,
    // solo cuando Resend confirma el envío.
    const clave = String(password);

    // 5. Redactar en el idioma del usuario
    const idioma = normalizarIdioma(destino.idioma);
    const t      = TEXTOS[idioma];
    const html   = correoHtml(idioma, {
      nombre:   `${destino.nombre ?? ''} ${destino.apellido ?? ''}`.trim() || destino.email,
      email:    destino.email,
      password: clave,
    });

    // 6. Enviar
    const enviarCorreo = (from: string) => fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:     `Estimation3D <${from}>`,
        to:       [destino.email],
        reply_to: FROM_EMAIL,
        subject:  t.asunto,
        html,
      }),
    });

    let remitente = FROM_EMAIL;
    let emailRes  = await enviarCorreo(FROM_EMAIL);

    if (!emailRes.ok) {
      const primerError  = await emailRes.json().catch(() => ({}));
      const primerMsg    = primerError?.message ?? `HTTP ${emailRes.status}`;
      console.error(`[enviar-credenciales] Resend rechazó ${FROM_EMAIL}: ${emailRes.status} ${primerMsg}`);

      // Cualquier 403 del remitente propio (dominio sin verificar, remitente no
      // permitido…) merece el reintento con el remitente de pruebas: antes solo
      // se reintentaba si el mensaje decía literalmente «not verified».
      if (emailRes.status === 403 && FROM_EMAIL !== FALLBACK_FROM) {
        remitente = FALLBACK_FROM;
        emailRes  = await enviarCorreo(FALLBACK_FROM);
        if (!emailRes.ok) {
          const payload    = await emailRes.json().catch(() => ({}));
          const segundoMsg = payload?.message ?? `HTTP ${emailRes.status}`;
          console.error(`[enviar-credenciales] Resend rechazó ${FALLBACK_FROM}: ${emailRes.status} ${segundoMsg}`);
          // Se devuelven los dos motivos: el del remitente real es el que hay
          // que arreglar; el del de pruebas explica por qué tampoco sirvió.
          const detalle = `${FROM_EMAIL}: ${primerMsg} — ${FALLBACK_FROM}: ${segundoMsg}`;
          return fail('envio_credenciales_fallido', `No se pudo enviar el correo: ${detalle}`, 502, detalle);
        }
      } else {
        return fail('envio_credenciales_fallido', `No se pudo enviar el correo: ${primerMsg}`, 502, primerMsg);
      }
    }

    // 7. El correo salió: recién ahora se aplica la contraseña anunciada.
    const { error: updError } = await adminClient.auth.admin.updateUserById(id, { password: clave });
    if (updError) {
      console.error(`[enviar-credenciales] correo enviado pero updateUserById falló: ${updError.message}`);
      return fail('password_no_aplicada', 'El correo se envió pero no se pudo aplicar la contraseña', 500, updError.message);
    }

    // La contraseña no vuelve en la respuesta: la escribió quien invita, ya la
    // conoce. Sí vuelve el remitente real, que es lo único que no puede saber.
    return json({ email: destino.email, idioma, remitente }, 200);

  } catch (err: any) {
    return fail('error_interno', err?.message ?? 'Error interno', 500, err?.message);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Textos por idioma ────────────────────────────────────────────────────────

interface Textos {
  lang:        string;
  asunto:      string;
  titulo:      string;
  saludo:      (nombre: string) => string;
  intro:       string;
  etqUsuario:  string;
  etqPassword: string;
  etqUrl:      string;
  cta:         string;
  aviso:       string;
  firma:       string;
}

const TEXTOS: Record<Idioma, Textos> = {
  es: {
    lang:        'es',
    asunto:      'Estimation3D, Invitación.',
    titulo:      'Invitación',
    saludo:      (n) => `Hola ${n},`,
    intro:       'Ya tiene acceso a Estimation3D. Estos son sus datos para iniciar sesión:',
    etqUsuario:  'Usuario',
    etqPassword: 'Contraseña',
    etqUrl:      'Dirección de la aplicación',
    cta:         'Iniciar sesión',
    aviso:       'Por seguridad, cambie esta contraseña la primera vez que entre, desde su perfil.',
    firma:       'Equipo Estimation3D',
  },
  fr: {
    lang:        'fr',
    asunto:      'Estimation3D, Invitation.',
    titulo:      'Invitation',
    saludo:      (n) => `Bonjour ${n},`,
    intro:       'Vous avez maintenant accès à Estimation3D. Voici vos identifiants de connexion :',
    etqUsuario:  'Utilisateur',
    etqPassword: 'Mot de passe',
    etqUrl:      'Adresse de l’application',
    cta:         'Se connecter',
    aviso:       'Par sécurité, changez ce mot de passe dès votre première connexion, depuis votre profil.',
    firma:       'L’équipe Estimation3D',
  },
  en: {
    lang:        'en',
    asunto:      'Estimation3D, Invitation.',
    titulo:      'Invitation',
    saludo:      (n) => `Hello ${n},`,
    intro:       'You now have access to Estimation3D. Here are your sign-in details:',
    etqUsuario:  'Username',
    etqPassword: 'Password',
    etqUrl:      'Application address',
    cta:         'Sign in',
    aviso:       'For your security, change this password the first time you sign in, from your profile.',
    firma:       'The Estimation3D team',
  },
};

interface DatosCorreo {
  nombre:   string;
  email:    string;
  password: string;
}

// Paleta del sistema (design.md): papel beige #F5F3EE, tarjeta crema #FBFAF6,
// tinta #1A1A1A, dorado #D4B96E, borde #E8E5DC. Serif de sistema para títulos
// (Fraunces no está disponible en clientes de correo).
function correoHtml(idioma: Idioma, d: DatosCorreo): string {
  const t = TEXTOS[idioma];

  const fila = (etiqueta: string, valor: string, mono = false) => `
    <tr>
      <td style="padding:8px 0;font-size:12px;color:#7A7770;text-transform:uppercase;letter-spacing:0.05em;vertical-align:top;width:190px;">${esc(etiqueta)}</td>
      <td style="padding:8px 0;font-size:15px;color:#1A1A1A;${mono ? "font-family:'Courier New',Courier,monospace;font-weight:bold;letter-spacing:0.03em;" : ''}">${esc(valor)}</td>
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
            <p style="margin:4px 0 0;font-size:13px;color:#7A7770;">${esc(t.titulo)}</p>
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
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background-color:#F5F3EE;border:1px solid #E8E5DC;border-radius:6px;padding:4px 20px;">
              ${fila(t.etqUsuario, d.email)}
              ${fila(t.etqPassword, d.password, true)}
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
          <td style="padding:16px 32px 28px;">
            <p style="margin:0;font-size:13px;color:#7A7770;line-height:1.6;">${esc(t.aviso)}</p>
            <p style="margin:20px 0 0;font-size:14px;">
              <a href="${APP_URL}" style="color:#B0964A;text-decoration:underline;">${APP_URL}</a>
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
