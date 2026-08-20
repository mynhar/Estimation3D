// Alta pública desde la landing: el formulario "Créez votre dossier" entra aquí.
//
// Es la única función sin sesión: la llama un visitante anónimo con la clave
// anon, así que no hay JWT de usuario que verificar y todo el trabajo lo hace
// el service role. Por eso valida el cuerpo con dureza y no acepta nada que el
// formulario no mande (rol, estado, precios… se fijan aquí, no llegan de fuera).
//
// Qué hace, en orden:
//   0. Aplica el límite de tasa por correo y por IP contra la tabla
//      `landing_solicitud_intento`. Sin sesión que lo frene, esto sería un
//      grifo abierto de altas reales y de correos desde nuestro dominio.
//   1. Busca el correo en `perfil`.
//   2. Si no existe, crea el usuario (rol cliente, activo) y su perfil. Genera
//      contraseña salvo que el correo sea de Gmail: esas cuentas entran con
//      Google y mandarles una contraseña sería mentirles.
//   3. Si ya existe, actualiza sus datos personales y su dirección. Nunca toca
//      la contraseña ni el rol.
//   4. Crea el expediente (visita a 3 días, 8:00, hora de Montréal) con su
//      localización, que es la misma dirección del cliente.
//   5. Escribe al cliente y al buzón interno vía Resend (secreto RESEND_API_KEY).
//
// Un fallo de correo NO deshace el expediente: la solicitud ya está registrada
// y el equipo la ve en la aplicación. La respuesta dice qué correos salieron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL      = 'https://estimation3d.vercel.app/';
const FROM_EMAIL   = Deno.env.get('INVITACION_FROM_EMAIL') ?? 'emiliopastora@estimation3d.com';
// Mientras el dominio del remitente no esté verificado en Resend, se reintenta
// con el remitente de pruebas de Resend (solo entrega al dueño de la cuenta).
const FALLBACK_FROM = 'onboarding@resend.dev';
// Buzón interno: quien atiende las solicitudes de la landing.
const AVISO_INTERNO = ['emiliopastora@estimation3d.com', 'emiliopastora@hygienaction.com'];

type Idioma = 'fr' | 'en' | 'es';
type TipoInmueble = 'casa' | 'apartamento' | 'edificio' | 'local_comercial' | 'otro';

/** Los valores del selector de la landing → enum `tipo_inmueble` de la base. */
const TIPO_INMUEBLE: Record<string, TipoInmueble> = {
  house:      'casa',
  apartment:  'apartamento',
  building:   'edificio',
  commercial: 'local_comercial',
  other:      'otro',
};

// Límite de tasa. El endpoint es público (basta la clave anon, que va en el
// bundle), así que sin freno cualquiera puede crear usuarios y disparar correos
// desde nuestro dominio en bucle. Los topes son holgados para un uso legítimo
// —una familia detrás del mismo NAT, alguien que se equivoca y reenvía— y
// cortan el abuso automatizado.
const LIMITE_EMAIL_24H = 3;    // solicitudes por correo y día
const LIMITE_IP_1H     = 5;    // ráfaga por IP
const LIMITE_IP_24H    = 12;   // acumulado por IP y día
const RETENCION_DIAS   = 7;    // cuánto se guarda la bitácora de intentos

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('metodo_no_permitido', 'Método no permitido', 405);
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Cuerpo ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return fail('campos_requeridos', 'Cuerpo inválido', 400);
    }

    const nombre    = limpiar(body.prenom);
    const apellido  = limpiar(body.nom);
    const telefono  = limpiar(body.telephone);
    const email     = limpiar(body.courriel)?.toLowerCase() ?? null;
    const tipoClave = limpiar(body.typePropriete);
    const servicioId = Number(body.servicioId);
    const descripcion = limpiar(body.description);
    const idioma    = normalizarIdioma(body.idioma);

    const dir = (body.adresse ?? {}) as Record<string, unknown>;
    const unidad   = limpiar(dir.numero_unidad);
    const calle    = limpiar(dir.calle);
    const ciudad   = limpiar(dir.ciudad);
    const provincia = limpiar(dir.provincia_ca)?.toUpperCase() ?? null;
    const postal   = limpiar(dir.codigo_postal)?.toUpperCase() ?? null;

    if (!nombre || !apellido || !telefono || !email || !calle || !ciudad || !provincia || !postal) {
      return fail('campos_requeridos', 'Faltan campos obligatorios', 400);
    }
    if (!EMAIL_RE.test(email)) {
      return fail('email_invalido', 'Correo inválido', 400);
    }
    if (!POSTAL_RE.test(postal)) {
      return fail('postal_invalido', 'Código postal inválido', 400);
    }
    if (!Number.isInteger(servicioId) || servicioId <= 0) {
      return fail('servicio_requerido', 'Servicio requerido', 400);
    }
    const tipoInmueble = TIPO_INMUEBLE[tipoClave ?? ''] ?? 'otro';

    // El servicio tiene que existir y estar activo: la landing solo ofrece los
    // activos, pero el cuerpo lo escribe el navegador y puede venir manipulado.
    const { data: servicio } = await adminClient
      .from('servicio')
      .select('id, nombre_fr, nombre_en, nombre_es')
      .eq('id', servicioId)
      .eq('activo', true)
      .maybeSingle();
    if (!servicio) {
      return fail('servicio_no_encontrado', 'Servicio no encontrado o inactivo', 400);
    }

    // ── 1 bis. Límite de tasa ─────────────────────────────────────────────
    // Se comprueba con el cuerpo ya validado, para que un atacante no gaste
    // cupo de nadie mandando basura, y se registra ANTES de crear nada: los
    // intentos que fallan más adelante también cuentan.
    const ip = ipDelCliente(req);
    const excedido = await limiteExcedido(adminClient, email, ip);
    if (excedido) {
      console.warn(`[crear-dossier-landing] límite ${excedido} — ip=${ip ?? '?'} email=${email}`);
      return fail('limite_alcanzado', `Límite de solicitudes alcanzado (${excedido})`, 429);
    }
    await registrarIntento(adminClient, email, ip);

    // ── 2. ¿El correo ya está en la aplicación? ───────────────────────────
    // `ilike` porque el correo pudo guardarse con mayúsculas; los comodines de
    // LIKE se escapan (`_` es carácter válido en un correo) y se limita a una
    // fila por si hubiera duplicados históricos.
    const { data: existente } = await adminClient
      .from('perfil')
      .select('id, rol, proveedor')
      .ilike('email', escaparLike(email))
      .limit(1)
      .maybeSingle();

    const direccion = {
      direccion_unidad:        unidad,
      direccion_calle:         calle,
      direccion_ciudad:        ciudad,
      direccion_provincia:     provincia,
      direccion_codigo_postal: postal,
    };

    let clienteId: string;
    let password: string | null = null;   // solo si se genera en esta llamada
    let usuarioNuevo = false;

    if (existente) {
      // Ya registrado: se refrescan sus datos y su dirección. Ni contraseña,
      // ni rol, ni `activo` — quien ya está dado de alta manda sobre eso.
      clienteId = existente.id;
      const { error: updError } = await adminClient
        .from('perfil')
        .update({ nombre, apellido, telefono, ...direccion })
        .eq('id', clienteId);
      if (updError) {
        return fail('perfil_error', updError.message, 500, updError.message);
      }
    } else {
      usuarioNuevo = true;
      // Gmail entra por Google: se crea la cuenta sin contraseña y con
      // `proveedor: 'google'`, y el correo de bienvenida no lleva credenciales.
      const esGoogle = esCorreoGoogle(email);
      password = esGoogle ? null : generarPassword();

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        ...(password ? { password } : {}),
        email_confirm: true,
        user_metadata: { nombre, apellido, telefono },
      });
      if (authError || !authData?.user) {
        return esEmailDuplicado(authError ?? {})
          ? fail('email_duplicado', authError!.message, 400)
          : fail('auth_error', authError?.message ?? 'Error de autenticación', 400, authError?.message);
      }
      clienteId = authData.user.id;

      const { error: upsertError } = await adminClient.from('perfil').upsert({
        id:              clienteId,
        nombre,
        apellido,
        telefono,
        email,
        rol:             'cliente',
        proveedor:       esGoogle ? 'google' : 'email',
        activo:          true,
        idioma,
        // Falta el avatar: el cliente completa su perfil en la aplicación.
        perfil_completo: false,
        ...direccion,
      });
      if (upsertError) {
        await adminClient.auth.admin.deleteUser(clienteId);
        return fail('perfil_error', upsertError.message, 500, upsertError.message);
      }
    }

    // ── 3. Expediente + localización ──────────────────────────────────────
    const fechaVisita = fechaVisitaEn3Dias();
    const deshacerUsuario = async () => {
      if (usuarioNuevo) await adminClient.auth.admin.deleteUser(clienteId);
    };

    const expediente = await insertarExpediente(adminClient, {
      cliente_id:   clienteId,
      servicio_id:  servicioId,
      estado:       'nuevo',
      fecha_visita: fechaVisita,
      descripcion,
    });
    if (!expediente.id) {
      await deshacerUsuario();
      return fail('expediente_error', expediente.error ?? 'No se pudo crear el expediente', 500, expediente.error);
    }

    const { error: locError } = await adminClient.from('localizacion').insert({
      expediente_id: expediente.id,
      tipo_inmueble: tipoInmueble,
      // Misma convención que client/file/create: la unidad va pegada a la calle.
      direccion:  unidad ? `${unidad}-${calle}` : calle,
      provincia,
      canton:     ciudad,
      distrito:   postal,
      referencia: null,
      latitud:    null,
      longitud:   null,
    });
    if (locError) {
      await adminClient.from('expediente').delete().eq('id', expediente.id);
      await deshacerUsuario();
      return fail('expediente_error', locError.message, 500, locError.message);
    }

    // ── 4. Correos ────────────────────────────────────────────────────────
    // A partir de aquí nada deshace el expediente: ya existe y el equipo lo ve
    // en la aplicación aunque el correo no salga.
    const datos: DatosSolicitud = {
      nombre:      `${nombre} ${apellido}`,
      email,
      telefono,
      direccion:   [unidad ? `${unidad}-${calle}` : calle, ciudad, provincia, postal].filter(Boolean).join(', '),
      fechaVisita,
      servicio:    nombreServicio(servicio, idioma),
      descripcion,
      numero:      expediente.numero!,
      password,
    };

    const resendKey = Deno.env.get('RESEND_API_KEY');
    let correoCliente = false;
    let correoInterno = false;

    if (!resendKey) {
      console.error('[crear-dossier-landing] falta RESEND_API_KEY: expediente creado sin avisos');
    } else {
      const asunto = `Estimation3D, ${datos.servicio}`;
      correoCliente = await enviar(resendKey, [email], asunto, correoClienteHtml(idioma, datos));
      correoInterno = await enviar(resendKey, AVISO_INTERNO, asunto, correoInternoHtml(datos));
    }

    return json({
      expediente_id: expediente.id,
      numero:        expediente.numero,
      cliente_id:    clienteId,
      usuario_nuevo: usuarioNuevo,
      fecha_visita:  fechaVisita,
      correo_cliente: correoCliente,
      correo_interno: correoInterno,
    }, 201);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    console.error('[crear-dossier-landing]', msg);
    return fail('error_interno', msg, 500, msg);
  }
});

// ── Base de datos ─────────────────────────────────────────────────────────

/**
 * IP del visitante. Detrás de la pasarela de Supabase la real es la primera de
 * `x-forwarded-for`; el resto son saltos intermedios. Devuelve `null` si no hay
 * nada usable: el límite por correo sigue en pie, y bloquear por no saber la IP
 * dejaría fuera a clientes legítimos.
 */
function ipDelCliente(req: Request): string | null {
  const cabecera =
    req.headers.get('x-forwarded-for')?.split(',')[0] ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    '';
  const ip = cabecera.trim();
  return ip && ip.length <= 45 ? ip : null;
}

/**
 * ¿Este correo o esta IP han gastado ya su cupo? Devuelve la regla incumplida
 * (para el log) o `null` si puede pasar.
 *
 * Falla en abierto a propósito: si la consulta se cae, se deja pasar la
 * solicitud. Un limitador roto no puede convertirse en una landing rota — el
 * coste de un alta de más es mucho menor que el de perder un cliente real.
 */
async function limiteExcedido(
  client: ReturnType<typeof createClient>,
  email: string,
  ip: string | null,
): Promise<string | null> {
  const ahora   = Date.now();
  const desde24 = new Date(ahora - 24 * 60 * 60 * 1000).toISOString();
  const haceUnaHora = ahora - 60 * 60 * 1000;

  const { count, error } = await client
    .from('landing_solicitud_intento')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('creado_en', desde24);
  if (error) {
    console.error('[crear-dossier-landing] límite por correo no verificable:', error.message);
  } else if ((count ?? 0) >= LIMITE_EMAIL_24H) {
    return 'correo/24h';
  }

  if (!ip) return null;

  // Una sola consulta para las dos ventanas de IP: se traen las marcas de las
  // últimas 24 h y la ráfaga de la última hora se cuenta aquí.
  const { data, error: errIp } = await client
    .from('landing_solicitud_intento')
    .select('creado_en')
    .eq('ip', ip)
    .gte('creado_en', desde24)
    .limit(200);
  if (errIp) {
    console.error('[crear-dossier-landing] límite por IP no verificable:', errIp.message);
    return null;
  }
  const marcas = (data ?? []) as { creado_en: string }[];
  if (marcas.length >= LIMITE_IP_24H) return 'ip/24h';
  const ultimaHora = marcas.filter((m) => Date.parse(m.creado_en) >= haceUnaHora).length;
  if (ultimaHora >= LIMITE_IP_1H) return 'ip/1h';

  return null;
}

/**
 * Apunta el intento y, de vez en cuando, tira lo que ya no sirve. La purga va
 * al azar (1 de cada 20 llamadas) para no pagar un DELETE en cada alta ni
 * depender de un cron que este proyecto no tiene.
 */
async function registrarIntento(
  client: ReturnType<typeof createClient>,
  email: string,
  ip: string | null,
): Promise<void> {
  const { error } = await client.from('landing_solicitud_intento').insert({ email, ip });
  if (error) {
    console.error('[crear-dossier-landing] no se pudo registrar el intento:', error.message);
    return;
  }
  if (Math.random() < 0.05) {
    const caducado = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { error: errPurga } = await client
      .from('landing_solicitud_intento')
      .delete()
      .lt('creado_en', caducado);
    if (errPurga) console.error('[crear-dossier-landing] purga:', errPurga.message);
  }
}

/**
 * Inserta el expediente reintentando si el número aleatorio ya existía
 * (colisión de `EXP-fecha-1234`, 1 entre 9000 por día).
 */
async function insertarExpediente(
  client: ReturnType<typeof createClient>,
  fila: Record<string, unknown>,
): Promise<{ id?: string; numero?: string; error?: string }> {
  let ultimoError = 'desconocido';
  for (let intento = 0; intento < 5; intento++) {
    const numero = generarNumeroExpediente();
    const { data, error } = await client
      .from('expediente')
      .insert({ ...fila, numero })
      .select('id')
      .single();
    if (!error && data) return { id: (data as { id: string }).id, numero };
    ultimoError = error?.message ?? 'desconocido';
    if (error?.code !== '23505') break;   // no es duplicado: no tiene sentido reintentar
  }
  return { error: ultimoError };
}

// ── Utilidades ────────────────────────────────────────────────────────────

function limpiar(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function normalizarIdioma(v: unknown): Idioma {
  return v === 'en' || v === 'es' || v === 'fr' ? v : 'fr';
}

/** Neutraliza los comodines de LIKE (`%`, `_`) antes de buscar un correo. */
function escaparLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Cuentas de Google: entran con OAuth, no con contraseña. */
function esCorreoGoogle(email: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email);
}

function esEmailDuplicado(err: { code?: string; message?: string }): boolean {
  return err?.code === 'email_exists'
    || /already (been )?registered|already exists/i.test(err?.message ?? '');
}

/** Contraseña de 14 caracteres con al menos una de cada clase, sin ambiguos. */
function generarPassword(): string {
  const grupos = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%*?-',
  ];
  const todos = grupos.join('');
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);

  const chars = grupos.map((g, i) => g[bytes[i] % g.length]);
  for (let i = grupos.length; i < bytes.length; i++) {
    chars.push(todos[bytes[i] % todos.length]);
  }

  // Barajado Fisher-Yates para que las cuatro primeras posiciones no delaten
  // siempre el mismo orden de clases.
  const mezcla = new Uint32Array(chars.length);
  crypto.getRandomValues(mezcla);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = mezcla[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function generarNumeroExpediente(): string {
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return `EXP-${hoy}-${1000 + (n[0] % 9000)}`;
}

/**
 * Visita tres días después del alta, a las 8:00. La fecha se cuenta en hora de
 * Montréal, no en UTC: a las 21:00 de Montréal el servidor ya está en el día
 * siguiente y la visita se habría agendado un día tarde.
 */
function fechaVisitaEn3Dias(): string {
  const hoyMtl = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());                       // YYYY-MM-DD
  const [y, m, d] = hoyMtl.split('-').map(Number);
  const visita = new Date(Date.UTC(y, m - 1, d));
  visita.setUTCDate(visita.getUTCDate() + 3);
  return `${visita.toISOString().slice(0, 10)}T08:00:00`;
}

function nombreServicio(s: Record<string, unknown>, idioma: Idioma): string {
  const fr = (s.nombre_fr as string) ?? '';
  const en = (s.nombre_en as string) ?? '';
  const es = (s.nombre_es as string) ?? '';
  return (idioma === 'en' ? en || fr || es : idioma === 'es' ? es || fr || en : fr || en || es) || '—';
}

function fmtFechaHora(iso: string, idioma: Idioma): string {
  const locale = idioma === 'en' ? 'en-CA' : idioma === 'es' ? 'es-CA' : 'fr-CA';
  const [fecha, hora] = iso.split('T');
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${dia} — ${(hora ?? '08:00:00').slice(0, 5)}`;
}

// ── Correo ────────────────────────────────────────────────────────────────

interface DatosSolicitud {
  nombre:      string;
  email:       string;
  telefono:    string;
  direccion:   string;
  fechaVisita: string;
  servicio:    string;
  descripcion: string | null;
  numero:      string;
  password:    string | null;
}

/** Envía por Resend, con reintento al remitente de pruebas si el dominio no está verificado. */
async function enviar(resendKey: string, para: string[], asunto: string, html: string): Promise<boolean> {
  const peticion = (from: string) => fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
    body: JSON.stringify({
      from:     `Estimation3D <${from}>`,
      to:       para,
      reply_to: FROM_EMAIL,
      subject:  asunto,
      html,
    }),
  });

  let res = await peticion(FROM_EMAIL);
  if (res.ok) return true;

  const primer = await res.json().catch(() => ({}));
  console.error(`[crear-dossier-landing] Resend rechazó ${FROM_EMAIL} → ${para.join(', ')}: ${res.status} ${primer?.message ?? ''}`);

  if (res.status === 403 && FROM_EMAIL !== FALLBACK_FROM) {
    res = await peticion(FALLBACK_FROM);
    if (res.ok) return true;
    const segundo = await res.json().catch(() => ({}));
    console.error(`[crear-dossier-landing] Resend rechazó ${FALLBACK_FROM} → ${para.join(', ')}: ${res.status} ${segundo?.message ?? ''}`);
  }
  return false;
}

interface Textos {
  titulo:      string;
  saludo:      (n: string) => string;
  intro:       string;
  introSinClave: string;
  etqUsuario:  string;
  etqPassword: string;
  etqNombre:   string;
  etqTelefono: string;
  etqDireccion: string;
  etqVisita:   string;
  etqServicio: string;
  etqDescripcion: string;
  etqNumero:   string;
  etqUrl:      string;
  cta:         string;
  aviso:       string;
  avisoGoogle: string;
  firma:       string;
}

const TEXTOS: Record<Idioma, Textos> = {
  fr: {
    titulo:      'Votre dossier',
    saludo:      (n) => `Bonjour ${n},`,
    intro:       'Nous avons bien reçu votre demande. Voici vos identifiants et le détail de votre dossier :',
    introSinClave: 'Nous avons bien reçu votre demande. Voici le détail de votre dossier :',
    etqUsuario:  'Utilisateur',
    etqPassword: 'Mot de passe',
    etqNombre:   'Nom',
    etqTelefono: 'Téléphone',
    etqDireccion: 'Adresse',
    etqVisita:   'Date de visite',
    etqServicio: 'Type de service',
    etqDescripcion: 'Description',
    etqNumero:   'Dossier',
    etqUrl:      'Adresse de l’application',
    cta:         'Se connecter',
    aviso:       'Par sécurité, changez ce mot de passe dès votre première connexion, depuis votre profil.',
    avisoGoogle: 'Votre adresse est une adresse Google : connectez-vous avec le bouton « Continuer avec Google ». Aucun mot de passe n’est nécessaire.',
    firma:       'L’équipe Estimation3D',
  },
  en: {
    titulo:      'Your file',
    saludo:      (n) => `Hello ${n},`,
    intro:       'We have received your request. Here are your sign-in details and your file:',
    introSinClave: 'We have received your request. Here is your file:',
    etqUsuario:  'Username',
    etqPassword: 'Password',
    etqNombre:   'Name',
    etqTelefono: 'Phone',
    etqDireccion: 'Address',
    etqVisita:   'Visit date',
    etqServicio: 'Type of service',
    etqDescripcion: 'Description',
    etqNumero:   'File',
    etqUrl:      'Application address',
    cta:         'Sign in',
    aviso:       'For your security, change this password the first time you sign in, from your profile.',
    avisoGoogle: 'Yours is a Google address: sign in with the “Continue with Google” button. No password is needed.',
    firma:       'The Estimation3D team',
  },
  es: {
    titulo:      'Su expediente',
    saludo:      (n) => `Hola ${n},`,
    intro:       'Hemos recibido su solicitud. Estos son sus datos de acceso y su expediente:',
    introSinClave: 'Hemos recibido su solicitud. Este es su expediente:',
    etqUsuario:  'Usuario',
    etqPassword: 'Contraseña',
    etqNombre:   'Nombre',
    etqTelefono: 'Teléfono',
    etqDireccion: 'Dirección',
    etqVisita:   'Fecha de visita',
    etqServicio: 'Tipo de servicio',
    etqDescripcion: 'Descripción',
    etqNumero:   'Expediente',
    etqUrl:      'Dirección de la aplicación',
    cta:         'Iniciar sesión',
    aviso:       'Por seguridad, cambie esta contraseña la primera vez que entre, desde su perfil.',
    avisoGoogle: 'Su correo es de Google: entre con el botón «Continuar con Google». No necesita contraseña.',
    firma:       'Equipo Estimation3D',
  },
};

function correoClienteHtml(idioma: Idioma, d: DatosSolicitud): string {
  const t = TEXTOS[idioma];
  const filas = [
    fila(t.etqUsuario, d.email),
    d.password ? fila(t.etqPassword, d.password, true) : '',
    fila(t.etqNombre, d.nombre),
    fila(t.etqTelefono, d.telefono),
    fila(t.etqDireccion, d.direccion),
    fila(t.etqVisita, fmtFechaHora(d.fechaVisita, idioma)),
    fila(t.etqServicio, d.servicio),
    fila(t.etqNumero, d.numero),
    d.descripcion ? fila(t.etqDescripcion, d.descripcion) : '',
    fila(t.etqUrl, APP_URL),
  ].join('');

  return plantilla({
    lang:   idioma,
    titulo: t.titulo,
    saludo: t.saludo(d.nombre),
    intro:  d.password ? t.intro : t.introSinClave,
    filas,
    cta:    t.cta,
    aviso:  d.password ? t.aviso : t.avisoGoogle,
    firma:  t.firma,
  });
}

/** Aviso interno, siempre en francés: es el idioma de trabajo del equipo. */
function correoInternoHtml(d: DatosSolicitud): string {
  const t = TEXTOS.fr;
  const filas = [
    fila(t.etqNombre, d.nombre),
    fila(t.etqTelefono, d.telefono),
    fila(t.etqUsuario, d.email),
    fila(t.etqDireccion, d.direccion),
    fila(t.etqVisita, fmtFechaHora(d.fechaVisita, 'fr')),
    fila(t.etqServicio, d.servicio),
    fila(t.etqNumero, d.numero),
    d.descripcion ? fila(t.etqDescripcion, d.descripcion) : '',
    fila(t.etqUrl, APP_URL),
  ].join('');

  return plantilla({
    lang:   'fr',
    titulo: 'Nouvelle demande — site public',
    saludo: 'Nouvelle demande reçue depuis la page d’accueil.',
    intro:  'Le dossier est déjà créé dans Estimation3D avec le client ci-dessous.',
    filas,
    cta:    'Ouvrir Estimation3D',
    aviso:  'Visite proposée automatiquement à trois jours, 8 h. À confirmer avec le client.',
    firma:  'Estimation3D',
  });
}

function fila(etiqueta: string, valor: string, mono = false): string {
  return `
    <tr>
      <td style="padding:8px 0;font-size:12px;color:#7A7770;text-transform:uppercase;letter-spacing:0.05em;vertical-align:top;width:190px;">${esc(etiqueta)}</td>
      <td style="padding:8px 0;font-size:15px;color:#1A1A1A;${mono ? "font-family:'Courier New',Courier,monospace;font-weight:bold;letter-spacing:0.03em;" : ''}">${esc(valor)}</td>
    </tr>`;
}

function plantilla(d: {
  lang: string; titulo: string; saludo: string; intro: string;
  filas: string; cta: string; aviso: string; firma: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${d.lang}">
<body style="margin:0;padding:0;background-color:#F5F3EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background-color:#FBFAF6;border:1px solid #E8E5DC;border-radius:8px;font-family:'Segoe UI','Helvetica Neue',sans-serif;">
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1A1A1A;">Estimation3D</p>
            <p style="margin:4px 0 0;font-size:13px;color:#7A7770;">${esc(d.titulo)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 12px;font-size:15px;color:#1A1A1A;">${esc(d.saludo)}</p>
            <p style="margin:0;font-size:14px;color:#1A1A1A;line-height:1.6;">${esc(d.intro)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="background-color:#F5F3EE;border:1px solid #E8E5DC;border-radius:6px;padding:4px 20px;">
              ${d.filas}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 4px;" align="center">
            <a href="${APP_URL}"
               style="display:inline-block;background-color:#D4B96E;color:#1A1A1A;text-decoration:none;font-size:15px;font-weight:600;padding:12px 36px;border-radius:6px;">
              ${esc(d.cta)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;">
            <p style="margin:0;font-size:13px;color:#7A7770;line-height:1.6;">${esc(d.aviso)}</p>
            <p style="margin:20px 0 0;font-size:14px;">
              <a href="${APP_URL}" style="color:#B0964A;text-decoration:underline;">${APP_URL}</a>
            </p>
            <p style="margin:20px 0 0;font-size:14px;color:#1A1A1A;">${esc(d.firma)}</p>
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

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Respuestas ────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Error con código estable. `code` es lo único que el frontend debe mostrar
 * (lo traduce a los tres idiomas); `error` queda para los logs.
 */
function fail(code: string, mensaje: string, status: number, detail?: string): Response {
  return json(detail ? { code, error: mensaje, detail } : { code, error: mensaje }, status);
}
