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
      email, password, nombre, apellido, telefono, avatar_url, rol, activo,
      compania_nombre, compania_telefono, compania_email, compania_direccion,
    } = body;

    if (!email || !password || !nombre || !apellido || !rol) {
      return fail('campos_requeridos', 'Campos requeridos: email, password, nombre, apellido, rol', 400);
    }

    // El estimador solo puede crear clientes
    if (callerRol === 'estimador' && rol !== 'cliente') {
      return fail('estimador_solo_clientes', 'Acceso denegado: el estimador solo puede crear usuarios con rol cliente', 403);
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
      perfil_completo,
      ...compania,
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
