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
      ...direccion,
    });

    if (upsertError) {
      // Rollback
      await adminClient.auth.admin.deleteUser(userId);
      return fail('perfil_error', upsertError.message, 500, upsertError.message);
    }

    return json({ id: userId }, 201);

  } catch (err: any) {
    return fail('error_interno', err?.message ?? 'Error interno', 500, err?.message);
  }
});

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
