import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('no_autorizado', 'No autorizado', 401);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return fail('token_invalido', 'Token inválido o expirado', 401);

    // Verificar rol
    const { data: caller } = await adminClient
      .from('perfil')
      .select('rol')
      .eq('id', user.id)
      .single();

    const callerRol = caller?.rol;
    if (callerRol !== 'administrador' && callerRol !== 'estimador') {
      return fail('rol_no_permitido', 'Acceso denegado: se requiere rol administrador o estimador', 403);
    }

    // Leer cuerpo
    const body = await req.json();
    const {
      id, nombre, apellido, telefono, avatar_url, activo, email, password,
      compania_nombre, compania_telefono, compania_email, compania_direccion,
    } = body;
    let { rol } = body;

    if (!id || !nombre || !apellido || !rol) {
      return fail('campos_requeridos', 'Campos requeridos: id, nombre, apellido, rol', 400);
    }

    // El estimador solo puede editar clientes y no puede cambiar su rol
    if (callerRol === 'estimador') {
      const { data: target } = await adminClient
        .from('perfil')
        .select('rol')
        .eq('id', id)
        .single();

      if (target?.rol !== 'cliente') {
        return fail('estimador_solo_clientes', 'Acceso denegado: el estimador solo puede editar usuarios con rol cliente', 403);
      }
      rol = 'cliente';
    }

    // Actualizar email y/o contraseña en auth.users (solo si se enviaron)
    if (email || password) {
      const authUpdate: { email?: string; password?: string } = {};
      if (email)    authUpdate.email    = email;
      if (password) authUpdate.password = password;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(id, authUpdate);
      if (authUpdateError) {
        return esEmailDuplicado(authUpdateError)
          ? fail('email_duplicado', authUpdateError.message, 400)
          : fail('auth_error', authUpdateError.message, 400, authUpdateError.message);
      }
    }

    // Actualizar perfil
    const perfil_completo = !!(nombre && apellido && telefono && avatar_url);

    const perfilPayload: Record<string, unknown> = {
      nombre,
      apellido,
      telefono:       telefono   || null,
      avatar_url:     avatar_url || null,
      rol,
      activo:         activo ?? true,
      perfil_completo,
      actualizado_en: new Date().toISOString(),
    };

    // Sincronizar email en perfil si cambió
    if (email) perfilPayload['email'] = email;

    // Datos de compañía: sólo del constructor. Se usa el `rol` final (el
    // estimador lo fuerza a 'cliente' arriba), y al dejar de ser constructor
    // se limpian para no arrastrar datos huérfanos.
    const limpiar = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t === '' ? null : t;
    };
    if (rol === 'constructor') {
      perfilPayload['compania_nombre']    = limpiar(compania_nombre);
      perfilPayload['compania_telefono']  = limpiar(compania_telefono);
      perfilPayload['compania_email']     = limpiar(compania_email);
      perfilPayload['compania_direccion'] = limpiar(compania_direccion);
    } else {
      perfilPayload['compania_nombre']    = null;
      perfilPayload['compania_telefono']  = null;
      perfilPayload['compania_email']     = null;
      perfilPayload['compania_direccion'] = null;
    }

    const { error: updateError } = await adminClient
      .from('perfil')
      .update(perfilPayload)
      .eq('id', id);

    if (updateError) return fail('perfil_error', updateError.message, 500, updateError.message);

    return json({ ok: true }, 200);

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
    headers: { ...cors, 'Content-Type': 'application/json' },
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
