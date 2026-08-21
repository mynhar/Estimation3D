import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // 1. Verificar el JWT y obtener el usuario
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return fail('token_invalido', 'Token inválido o expirado', 401);
    }

    // 2. Verificar rol usando admin client (bypasa RLS)
    const { data: perfil } = await adminClient
      .from('perfil')
      .select('rol')
      .eq('id', user.id)
      .single();

    const callerRol = perfil?.rol;
    if (callerRol !== 'administrador' && callerRol !== 'estimador') {
      return fail('rol_no_permitido', 'Acceso denegado: se requiere rol administrador o estimador', 403);
    }

    // 3. Leer y validar cuerpo
    const body = await req.json();
    const {
      email, password, nombre, apellido, telefono, avatar_url, rol, activo, idioma,
      compania_nombre, compania_telefono, compania_email, compania_direccion,
      rbq, especialidad_ids, especialidad_todas, anios_experiencia, zona_servicio, mensaje,
      direccion_unidad, direccion_calle, direccion_ciudad,
      direccion_provincia, direccion_codigo_postal,
    } = body;

    if (!email || !password || !nombre || !apellido || !rol) {
      return fail('campos_requeridos', 'Campos requeridos: email, password, nombre, apellido, rol', 400);
    }

    // El estimador da de alta a los dos roles externos —cliente y constructor—,
    // que son los que trata en su día a día. Los roles internos (estimador,
    // administrador) siguen siendo cosa del administrador.
    if (callerRol === 'estimador' && rol !== 'cliente' && rol !== 'constructor') {
      return fail('estimador_rol_no_permitido', 'Acceso denegado: el estimador solo puede crear usuarios con rol cliente o constructor', 403);
    }

    const perfil_completo = !!(nombre && apellido && telefono && avatar_url);

    // Los datos de compañía son sólo del constructor: para cualquier otro rol
    // se ignoran, aunque el cliente los mande.
    const esConstructor = rol === 'constructor';
    const limpiar = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t === '' ? null : t;
    };
    const compania = esConstructor
      ? {
          compania_nombre:    limpiar(compania_nombre),
          compania_telefono:  limpiar(compania_telefono),
          compania_email:     limpiar(compania_email),
          compania_direccion: limpiar(compania_direccion),
        }
      : {
          compania_nombre:    null,
          compania_telefono:  null,
          compania_email:     null,
          compania_direccion: null,
        };

    // Datos profesionales del constructor: licencia RBQ, especialidad, años de
    // experiencia, zona cubierta y una nota libre. Igual que los de compañía,
    // se ignoran para cualquier otro rol.
    const entero = (v: unknown): number | null => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : null;
    };
    const rbqLimpio = limpiar(rbq);
    if (esConstructor && rbqLimpio && !/^\d{4}-\d{4}-\d{2}$/.test(rbqLimpio)) {
      return fail('rbq_formato', 'El número de licencia RBQ debe tener el formato 0000-0000-00', 400);
    }
    const anios = entero(anios_experiencia);
    if (esConstructor && anios !== null && (anios < 0 || anios > 80)) {
      return fail('anios_experiencia_rango', 'Los años de experiencia deben estar entre 0 y 80', 400);
    }
    // Especialidades: «Todos los servicios» y una lista concreta son excluyentes
    // (lo garantiza también un CHECK en la tabla), y para el constructor una de
    // las dos es obligatoria. La lista completa vive en `perfil_especialidad`;
    // `especialidad_id` se conserva como resumen —el único id elegido, o NULL si
    // hay varios— porque hay lecturas antiguas que miran esa columna.
    //
    // Sólo se exigen si el cuerpo trae la sección. Las dos pantallas de alta
    // —administrador y estimador— la envían siempre que el rol sea constructor;
    // la puerta queda para cualquier llamador que no la mande, que entonces
    // crea el constructor sin especialidades en vez de recibir un 400.
    const todas = especialidad_todas === true;
    const ids   = todas ? [] : idsUnicos(especialidad_ids);
    const traeEspecialidades = 'especialidad_ids' in body || 'especialidad_todas' in body;
    if (esConstructor && traeEspecialidades) {
      if (!todas && ids.length === 0) {
        return fail('especialidad_requerida', 'Debe indicar al menos una especialidad', 400);
      }
      if (ids.length > MAX_ESPECIALIDADES) {
        return fail('especialidad_requerida', 'Demasiadas especialidades', 400);
      }
      // El catálogo lo pinta el navegador, así que el cuerpo puede venir
      // manipulado: los ids tienen que existir y estar activos.
      const desconocido = await servicioInactivo(adminClient, ids);
      if (desconocido instanceof Response) return desconocido;
      if (desconocido !== null) {
        return fail('servicio_no_encontrado', `Servicio ${desconocido} no encontrado o inactivo`, 400);
      }
    }
    const constructor = esConstructor
      ? {
          rbq:                rbqLimpio,
          especialidad_id:    ids.length === 1 ? ids[0] : null,
          especialidad_todas: todas,
          anios_experiencia:  anios,
          zona_servicio:      limpiar(zona_servicio),
          mensaje:            limpiar(mensaje),
        }
      : {
          rbq:                null,
          especialidad_id:    null,
          especialidad_todas: false,
          anios_experiencia:  null,
          zona_servicio:      null,
          mensaje:            null,
        };

    // Idioma del usuario: es en el que se le escribirá (enviar-credenciales lo
    // lee de aquí). Quien no lo mande se queda con 'fr', el idioma por defecto
    // de la aplicación y de la columna; el propio usuario lo cambia al elegir
    // idioma en la aplicación.
    const idiomaElegido = idioma === 'en' || idioma === 'es' || idioma === 'fr' ? idioma : 'fr';

    // La dirección personal es opcional y aplica a todos los roles: se guarda
    // tal cual, campo vacío = null.
    const direccion = {
      direccion_unidad:        limpiar(direccion_unidad),
      direccion_calle:         limpiar(direccion_calle),
      direccion_ciudad:        limpiar(direccion_ciudad),
      direccion_provincia:     limpiar(direccion_provincia),
      direccion_codigo_postal: limpiar(direccion_codigo_postal),
    };

    // 4. Crear en auth.users
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido, telefono },
    });

    if (authError) {
      // El correo duplicado es el fallo habitual y tiene mensaje propio; el
      // resto se devuelve como detalle sin traducir (diagnóstico, no UI).
      return esEmailDuplicado(authError)
        ? fail('email_duplicado', authError.message, 400)
        : fail('auth_error', authError.message, 400, authError.message);
    }

    const userId = authData.user.id;

    // 5. Upsert en perfil
    const { error: upsertError } = await adminClient.from('perfil').upsert({
      id:             userId,
      nombre,
      apellido,
      telefono:       telefono   || null,
      avatar_url:     avatar_url || null,
      email,
      rol,
      proveedor:      'email',
      activo:         activo ?? true,
      idioma:         idiomaElegido,
      perfil_completo,
      ...compania,
      ...constructor,
      ...direccion,
    });

    if (upsertError) {
      // Rollback
      await adminClient.auth.admin.deleteUser(userId);
      return fail('perfil_error', upsertError.message, 500, upsertError.message);
    }

    // 6. Especialidades del constructor
    // El alta es una sola cosa: si la lista no entra, el usuario tampoco se
    // queda — quedaría un constructor sin las especialidades que se le
    // asignaron, y el administrador no tendría forma de saberlo.
    if (ids.length > 0) {
      const { error: espError } = await adminClient
        .from('perfil_especialidad')
        .insert(ids.map((servicio_id) => ({ perfil_id: userId, servicio_id })));
      if (espError) {
        await adminClient.auth.admin.deleteUser(userId);
        return fail('perfil_error', espError.message, 500, espError.message);
      }
    }

    return json({ id: userId }, 201);

  } catch (err: any) {
    return fail('error_interno', err?.message ?? 'Error interno', 500, err?.message);
  }
});

/** Tope de especialidades; el catálogo real es mucho menor. */
const MAX_ESPECIALIDADES = 40;

/** Ids enteros, sin repetidos y sin basura, en el orden en que llegaron. */
function idsUnicos(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  for (const x of v) {
    const n = typeof x === 'number' ? x : parseInt(String(x ?? ''), 10);
    if (Number.isInteger(n) && n > 0) vistos.add(n);
  }
  return [...vistos];
}

/**
 * Devuelve el primer id que no corresponda a un servicio activo, `null` si
 * todos valen, o la respuesta de error si la consulta al catálogo falla.
 */
async function servicioInactivo(
  client: { from: (t: string) => any },
  ids: number[],
): Promise<number | null | Response> {
  if (ids.length === 0) return null;
  const { data, error } = await client
    .from('servicio')
    .select('id')
    .eq('activo', true)
    .in('id', ids);
  if (error) return fail('error_interno', error.message, 500, error.message);
  const activos = new Set((data ?? []).map((s: { id: number }) => Number(s.id)));
  return ids.find((id) => !activos.has(id)) ?? null;
}

/** GoTrue no expone un código estable en todas las versiones: se comprueban ambos. */
function esEmailDuplicado(err: { code?: string; message?: string }): boolean {
  return err?.code === 'email_exists'
    || /already (been )?registered|already exists/i.test(err?.message ?? '');
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
