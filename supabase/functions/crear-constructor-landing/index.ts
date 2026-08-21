// Candidatura pública de constructores: el formulario «Devenir entrepreneur
// partenaire» de /entrepreneurs entra aquí.
//
// Hermana de `crear-dossier-landing`: las dos son públicas, las llama un
// visitante anónimo con la clave anon y todo el trabajo lo hace el service
// role. Por eso valida el cuerpo con dureza y no acepta nada que el formulario
// no mande — el rol y el estado se fijan aquí, no llegan de fuera.
//
// Qué hace, en orden:
//   0. Límite de tasa por correo y por IP contra `landing_solicitud_intento`,
//      la misma bitácora que usa la otra función: sin sesión que lo frene esto
//      sería un grifo abierto de altas reales y de correos desde el dominio.
//   1. Comprueba que los servicios elegidos existen y están activos.
//   2. Busca el correo en `perfil`:
//        · ya es constructor  → actualiza sus datos. Nunca la contraseña.
//        · existe con otro rol → 409. La aplicación le dice que hable con el
//          administrador; aquí no se degrada ni se convierte a nadie.
//        · no existe          → crea el usuario (rol constructor, activo) y su
//          perfil. Genera contraseña salvo que el correo sea de Gmail: esas
//          cuentas entran con Google y mandarles una contraseña sería mentirles.
//   3. Reescribe sus especialidades en `perfil_especialidad`.
//   4. Escribe al constructor y al buzón interno vía Resend (RESEND_API_KEY).
//
// Un fallo de correo NO deshace el alta: la candidatura ya está registrada y el
// equipo la ve en la aplicación. La respuesta dice qué correos salieron.

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
// Buzón interno: quien atiende las candidaturas del sitio público.
const AVISO_INTERNO = ['emiliopastora@estimation3d.com', 'emiliopastora@hygienaction.com'];

type Idioma = 'fr' | 'en' | 'es';

// Mismos topes que la otra función pública y contra la misma bitácora: los dos
// formularios comparten cupo por correo y por IP, que es justo lo que se quiere
// —el abuso no se reparte entre endpoints—.
const LIMITE_EMAIL_24H = 3;
const LIMITE_IP_1H     = 5;
const LIMITE_IP_24H    = 12;
const RETENCION_DIAS   = 7;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Licencia RBQ de Quebec: diez dígitos en tres bloques, «0000-0000-00». */
const RBQ_RE   = /^\d{4}-\d{4}-\d{2}$/;
/** Tope de especialidades por candidatura; el catálogo real es mucho menor. */
const MAX_ESPECIALIDADES = 40;

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

    const empresa  = limpiar(body.entreprise);
    const nombre   = limpiar(body.prenom);
    const apellido = limpiar(body.nom);
    const telefono = limpiar(body.telephone);
    const email    = limpiar(body.courriel)?.toLowerCase() ?? null;
    const rbq      = limpiar(body.rbq);
    const zona     = limpiar(body.zone);
    const mensaje  = limpiar(body.message);
    const idioma   = normalizarIdioma(body.idioma);
    const todas    = body.toutes === true;
    const anios    = entero(body.annees);

    if (!empresa || !nombre || !apellido || !telefono || !email || !rbq || !zona) {
      return fail('campos_requeridos', 'Faltan campos obligatorios', 400);
    }
    if (!EMAIL_RE.test(email)) {
      return fail('email_invalido', 'Correo inválido', 400);
    }
    if (!RBQ_RE.test(rbq)) {
      return fail('rbq_formato', 'El número de licencia RBQ debe tener el formato 0000-0000-00', 400);
    }
    if (anios === null || anios < 0 || anios > 80) {
      return fail('anios_experiencia_rango', 'Los años de experiencia deben estar entre 0 y 80', 400);
    }

    // «Todos los servicios» y una lista concreta son excluyentes: si viene la
    // marca, la lista se descarta (es lo que hace también el formulario).
    const pedidos = todas ? [] : idsUnicos(body.specialites);
    if (!todas && pedidos.length === 0) {
      return fail('especialidad_requerida', 'Debe indicar al menos una especialidad', 400);
    }
    if (pedidos.length > MAX_ESPECIALIDADES) {
      return fail('especialidad_requerida', 'Demasiadas especialidades', 400);
    }

    // El catálogo lo pinta el navegador, así que el cuerpo puede venir
    // manipulado: los ids tienen que existir y estar activos. De paso salen de
    // aquí los nombres que van en el correo, ya en el idioma del candidato.
    const { data: catalogo, error: errCatalogo } = await adminClient
      .from('servicio')
      .select('id, nombre_fr, nombre_en, nombre_es')
      .eq('activo', true)
      .order('codigo');
    if (errCatalogo) {
      return fail('error_interno', errCatalogo.message, 500, errCatalogo.message);
    }
    const activos = (catalogo ?? []) as Record<string, unknown>[];
    const porId = new Map(activos.map((s) => [Number(s.id), s]));
    const desconocido = pedidos.find((id) => !porId.has(id));
    if (desconocido !== undefined) {
      return fail('servicio_no_encontrado', `Servicio ${desconocido} no encontrado o inactivo`, 400);
    }

    const especialidades = todas
      ? activos.map((s) => nombreServicio(s, idioma))
      : pedidos.map((id) => nombreServicio(porId.get(id)!, idioma));

    // ── 1 bis. Límite de tasa ─────────────────────────────────────────────
    // Con el cuerpo ya validado, para que nadie gaste cupo ajeno mandando
    // basura, y ANTES de crear nada: lo que falle después también cuenta.
    const ip = ipDelCliente(req);
    const excedido = await limiteExcedido(adminClient, email, ip);
    if (excedido) {
      console.warn(`[crear-constructor-landing] límite ${excedido} — ip=${ip ?? '?'} email=${email}`);
      return fail('limite_alcanzado', `Límite de solicitudes alcanzado (${excedido})`, 429);
    }
    await registrarIntento(adminClient, email, ip);

    // ── 2. ¿El correo ya está en la aplicación? ───────────────────────────
    // `ilike` porque el correo pudo guardarse con mayúsculas; los comodines de
    // LIKE se escapan (`_` es carácter válido en un correo) y se limita a una
    // fila por si hubiera duplicados históricos.
    const { data: existente, error: errBusqueda } = await adminClient
      .from('perfil')
      .select('id, rol')
      .ilike('email', escaparLike(email))
      .limit(1)
      .maybeSingle();
    if (errBusqueda) {
      return fail('perfil_error', errBusqueda.message, 500, errBusqueda.message);
    }

    // Sólo una especialidad marcada: se copia también a la columna escalar,
    // que es la que lee la pantalla de edición del administrador. Con varias no
    // hay forma honesta de elegir una, y queda NULL: la respuesta completa vive
    // en `perfil_especialidad`.
    const datosConstructor = {
      nombre,
      apellido,
      telefono,
      compania_nombre:    empresa,
      rbq,
      especialidad_todas: todas,
      especialidad_id:    pedidos.length === 1 ? pedidos[0] : null,
      anios_experiencia:  anios,
      zona_servicio:      zona,
      mensaje,
    };

    let constructorId: string;
    let password: string | null = null;   // solo si se genera en esta llamada
    let usuarioNuevo = false;

    if (existente) {
      // Un correo ya registrado con otro rol no se toca: convertir a un cliente
      // en constructor por rellenar un formulario público sería un cambio de
      // permisos sin control. Lo resuelve el administrador.
      if (existente.rol !== 'constructor') {
        return fail('rol_existente', `El correo ya pertenece a un usuario con rol ${existente.rol}`, 409);
      }

      constructorId = existente.id;
      // Ni contraseña, ni rol, ni `activo`: quien ya está dado de alta manda
      // sobre eso. Sólo se refrescan los datos profesionales.
      const { error: updError } = await adminClient
        .from('perfil')
        .update(datosConstructor)
        .eq('id', constructorId);
      if (updError) {
        return fail('perfil_error', updError.message, 500, updError.message);
      }
    } else {
      usuarioNuevo = true;
      // Gmail entra por Google: se crea la cuenta sin contraseña y con
      // `proveedor: 'google'`, y el correo de alta no lleva credenciales.
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
      constructorId = authData.user.id;

      const { error: upsertError } = await adminClient.from('perfil').upsert({
        id:              constructorId,
        email,
        rol:             'constructor',
        proveedor:       esGoogle ? 'google' : 'email',
        activo:          true,
        idioma,
        // Falta el avatar: el constructor completa su perfil en la aplicación.
        perfil_completo: false,
        ...datosConstructor,
      });
      if (upsertError) {
        await adminClient.auth.admin.deleteUser(constructorId);
        return fail('perfil_error', upsertError.message, 500, upsertError.message);
      }
    }

    // ── 3. Especialidades ─────────────────────────────────────────────────
    // Se reescriben enteras: la candidatura es la foto actual de lo que hace
    // este constructor, no un añadido a lo que dijo la vez anterior.
    const { error: errBorrado } = await adminClient
      .from('perfil_especialidad')
      .delete()
      .eq('perfil_id', constructorId);
    if (errBorrado) {
      console.error('[crear-constructor-landing] especialidades (borrado):', errBorrado.message);
    }
    if (pedidos.length) {
      const { error: errInsercion } = await adminClient
        .from('perfil_especialidad')
        .insert(pedidos.map((servicio_id) => ({ perfil_id: constructorId, servicio_id })));
      if (errInsercion) {
        console.error('[crear-constructor-landing] especialidades (inserción):', errInsercion.message);
      }
    }

    // ── 4. Correos ────────────────────────────────────────────────────────
    // A partir de aquí nada deshace el alta: el constructor ya existe y el
    // equipo lo ve en la aplicación aunque el correo no salga.
    const datos: DatosCandidatura = {
      nombre: `${nombre} ${apellido}`,
      empresa,
      email,
      telefono,
      password,
      especialidades,
      todas,
    };

    const resendKey = Deno.env.get('RESEND_API_KEY');
    let correoConstructor = false;
    let correoInterno     = false;

    if (!resendKey) {
      console.error('[crear-constructor-landing] falta RESEND_API_KEY: alta creada sin avisos');
    } else {
      correoConstructor = await enviar(
        resendKey, [email],
        `Estimation3D, ${listaServicios(especialidades, todas, idioma)}`,
        correoConstructorHtml(idioma, datos),
      );
      // El aviso interno va siempre en francés, el idioma de trabajo del equipo.
      const especialidadesFr = todas
        ? activos.map((s) => nombreServicio(s, 'fr'))
        : pedidos.map((id) => nombreServicio(porId.get(id)!, 'fr'));
      correoInterno = await enviar(
        resendKey, AVISO_INTERNO,
        `Estimation3D, ${TEXTOS.fr.rol}, ${listaServicios(especialidadesFr, todas, 'fr')}`,
        correoInternoHtml(datos, especialidadesFr),
      );
    }

    return json({
      constructor_id:     constructorId,
      usuario_nuevo:      usuarioNuevo,
      correo_constructor: correoConstructor,
      correo_interno:     correoInterno,
    }, usuarioNuevo ? 201 : 200);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    console.error('[crear-constructor-landing]', msg);
    return fail('error_interno', msg, 500, msg);
  }
});

// ── Límite de tasa ────────────────────────────────────────────────────────

/**
 * IP del visitante. Detrás de la pasarela de Supabase la real es la primera de
 * `x-forwarded-for`; el resto son saltos intermedios. Devuelve `null` si no hay
 * nada usable: el límite por correo sigue en pie, y bloquear por no saber la IP
 * dejaría fuera a candidatos legítimos.
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
 * Falla en abierto a propósito: si la consulta se cae, se deja pasar. Un
 * limitador roto no puede convertirse en un formulario roto.
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
    console.error('[crear-constructor-landing] límite por correo no verificable:', error.message);
  } else if ((count ?? 0) >= LIMITE_EMAIL_24H) {
    return 'correo/24h';
  }

  if (!ip) return null;

  const { data, error: errIp } = await client
    .from('landing_solicitud_intento')
    .select('creado_en')
    .eq('ip', ip)
    .gte('creado_en', desde24)
    .limit(200);
  if (errIp) {
    console.error('[crear-constructor-landing] límite por IP no verificable:', errIp.message);
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
 * al azar para no pagar un DELETE en cada alta ni depender de un cron que este
 * proyecto no tiene.
 */
async function registrarIntento(
  client: ReturnType<typeof createClient>,
  email: string,
  ip: string | null,
): Promise<void> {
  const { error } = await client.from('landing_solicitud_intento').insert({ email, ip });
  if (error) {
    console.error('[crear-constructor-landing] no se pudo registrar el intento:', error.message);
    return;
  }
  if (Math.random() < 0.05) {
    const caducado = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { error: errPurga } = await client
      .from('landing_solicitud_intento')
      .delete()
      .lt('creado_en', caducado);
    if (errPurga) console.error('[crear-constructor-landing] purga:', errPurga.message);
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────

function limpiar(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function entero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Ids de especialidad del cuerpo: enteros positivos, sin repetir, sin basura. */
function idsUnicos(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  for (const x of v) {
    const n = entero(x);
    if (n !== null && n > 0) vistos.add(n);
  }
  return [...vistos];
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

function nombreServicio(s: Record<string, unknown>, idioma: Idioma): string {
  const fr = (s.nombre_fr as string) ?? '';
  const en = (s.nombre_en as string) ?? '';
  const es = (s.nombre_es as string) ?? '';
  return (idioma === 'en' ? en || fr || es : idioma === 'es' ? es || fr || en : fr || en || es) || '—';
}

/**
 * Los servicios tal como se leen en el asunto y en el cuerpo. «Todos» no se
 * expande a la lista entera: en el asunto de un correo no cabe y no dice más
 * que la etiqueta.
 */
function listaServicios(nombres: string[], todas: boolean, idioma: Idioma): string {
  return todas ? TEXTOS[idioma].todosLosServicios : nombres.join(', ');
}

// ── Correo ────────────────────────────────────────────────────────────────

interface DatosCandidatura {
  nombre:         string;
  empresa:        string;
  email:          string;
  telefono:       string;
  password:       string | null;
  especialidades: string[];
  todas:          boolean;
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
  console.error(`[crear-constructor-landing] Resend rechazó ${FROM_EMAIL} → ${para.join(', ')}: ${res.status} ${primer?.message ?? ''}`);

  if (res.status === 403 && FROM_EMAIL !== FALLBACK_FROM) {
    res = await peticion(FALLBACK_FROM);
    if (res.ok) return true;
    const segundo = await res.json().catch(() => ({}));
    console.error(`[crear-constructor-landing] Resend rechazó ${FALLBACK_FROM} → ${para.join(', ')}: ${res.status} ${segundo?.message ?? ''}`);
  }
  return false;
}

interface Textos {
  titulo:        string;
  rol:           string;
  saludo:        (n: string) => string;
  intro:         string;
  introSinClave: string;
  etqRol:        string;
  etqNombre:     string;
  etqEmpresa:    string;
  etqUsuario:    string;
  etqPassword:   string;
  etqTelefono:   string;
  etqServicios:  string;
  etqUrl:        string;
  cta:           string;
  aviso:         string;
  avisoGoogle:   string;
  firma:         string;
  todosLosServicios: string;
}

const TEXTOS: Record<Idioma, Textos> = {
  fr: {
    titulo:        'Votre candidature',
    rol:           'Entrepreneur',
    saludo:        (n) => `Bonjour ${n},`,
    intro:         'Nous avons bien reçu votre candidature. Voici vos identifiants et les informations enregistrées :',
    introSinClave: 'Nous avons bien reçu votre candidature. Voici les informations enregistrées :',
    etqRol:        'Profil',
    etqNombre:     'Nom',
    etqEmpresa:    'Entreprise',
    etqUsuario:    'Utilisateur',
    etqPassword:   'Mot de passe',
    etqTelefono:   'Téléphone',
    etqServicios:  'Services offerts',
    etqUrl:        'Adresse de l’application',
    cta:           'Se connecter',
    aviso:         'Par sécurité, changez ce mot de passe dès votre première connexion, depuis votre profil.',
    avisoGoogle:   'Votre adresse est une adresse Google : connectez-vous avec le bouton « Continuer avec Google ». Aucun mot de passe n’est nécessaire.',
    firma:         'L’équipe Estimation3D',
    todosLosServicios: 'Tous les services',
  },
  en: {
    titulo:        'Your application',
    rol:           'Contractor',
    saludo:        (n) => `Hello ${n},`,
    intro:         'We have received your application. Here are your sign-in details and the information on file:',
    introSinClave: 'We have received your application. Here is the information on file:',
    etqRol:        'Profile',
    etqNombre:     'Name',
    etqEmpresa:    'Company',
    etqUsuario:    'Username',
    etqPassword:   'Password',
    etqTelefono:   'Phone',
    etqServicios:  'Services offered',
    etqUrl:        'Application address',
    cta:           'Sign in',
    aviso:         'For your security, change this password the first time you sign in, from your profile.',
    avisoGoogle:   'Yours is a Google address: sign in with the “Continue with Google” button. No password is needed.',
    firma:         'The Estimation3D team',
    todosLosServicios: 'All services',
  },
  es: {
    titulo:        'Su candidatura',
    rol:           'Constructor',
    saludo:        (n) => `Hola ${n},`,
    intro:         'Hemos recibido su candidatura. Estos son sus datos de acceso y la información registrada:',
    introSinClave: 'Hemos recibido su candidatura. Esta es la información registrada:',
    etqRol:        'Perfil',
    etqNombre:     'Nombre',
    etqEmpresa:    'Empresa',
    etqUsuario:    'Usuario',
    etqPassword:   'Contraseña',
    etqTelefono:   'Teléfono',
    etqServicios:  'Servicios que ofrece',
    etqUrl:        'Dirección de la aplicación',
    cta:           'Iniciar sesión',
    aviso:         'Por seguridad, cambie esta contraseña la primera vez que entre, desde su perfil.',
    avisoGoogle:   'Su correo es de Google: entre con el botón «Continuar con Google». No necesita contraseña.',
    firma:         'Equipo Estimation3D',
    todosLosServicios: 'Todos los servicios',
  },
};

function correoConstructorHtml(idioma: Idioma, d: DatosCandidatura): string {
  const t = TEXTOS[idioma];
  const filas = [
    fila(t.etqRol, t.rol),
    fila(t.etqNombre, d.nombre),
    fila(t.etqEmpresa, d.empresa),
    fila(t.etqUsuario, d.email),
    d.password ? fila(t.etqPassword, d.password, true) : '',
    fila(t.etqTelefono, d.telefono),
    fila(t.etqServicios, listaServicios(d.especialidades, d.todas, idioma)),
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

/**
 * Aviso interno, siempre en francés: es el idioma de trabajo del equipo. Sin la
 * contraseña — sólo la ve su dueño.
 */
function correoInternoHtml(d: DatosCandidatura, especialidadesFr: string[]): string {
  const t = TEXTOS.fr;
  const filas = [
    fila(t.etqRol, t.rol),
    fila(t.etqNombre, d.nombre),
    fila(t.etqEmpresa, d.empresa),
    fila(t.etqUsuario, d.email),
    fila(t.etqTelefono, d.telefono),
    fila(t.etqServicios, listaServicios(especialidadesFr, d.todas, 'fr')),
    fila(t.etqUrl, APP_URL),
  ].join('');

  return plantilla({
    lang:   'fr',
    titulo: 'Nouvelle candidature — site public',
    saludo: 'Nouvelle candidature d’entrepreneur reçue depuis le site public.',
    intro:  'Le compte est déjà créé dans Estimation3D avec le profil ci-dessous.',
    filas,
    cta:    'Ouvrir Estimation3D',
    aviso:  'Vérifiez la licence RBQ et la zone couverte avant de l’inviter à soumissionner.',
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
