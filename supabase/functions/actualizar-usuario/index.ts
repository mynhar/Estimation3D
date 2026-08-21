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
      id, nombre, apellido, telefono, avatar_url, activo, email, password, rol,
      compania_nombre, compania_telefono, compania_email, compania_direccion,
      rbq, especialidad_ids, especialidad_todas, anios_experiencia, zona_servicio, mensaje,
    } = body;

    if (!id || !nombre || !apellido || !rol) {
      return fail('campos_requeridos', 'Campos requeridos: id, nombre, apellido, rol', 400);
    }

    // El estimador gestiona los dos roles externos: edita clientes y
    // constructores, y puede mover una cuenta de un rol al otro. Lo que no
    // puede es tocar cuentas internas ni ascender a nadie a estimador o
    // administrador — ni por el rol de destino ni por el de origen.
    if (callerRol === 'estimador') {
      const { data: target } = await adminClient
        .from('perfil')
        .select('rol')
        .eq('id', id)
        .single();

      const externos = ['cliente', 'constructor'];
      if (!externos.includes(target?.rol) || !externos.includes(rol)) {
        return fail('estimador_rol_no_permitido', 'Acceso denegado: el estimador solo puede gestionar usuarios con rol cliente o constructor', 403);
      }
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

    // Datos de compañía: sólo del constructor. Se usa el `rol` final, y al
    // dejar de ser constructor se limpian para no arrastrar datos huérfanos.
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

    // Datos profesionales del constructor: licencia RBQ, especialidad, años de
    // experiencia, zona cubierta y nota libre. Mismo criterio que la dirección:
    // sólo se tocan si el cuerpo trae la sección, para que un llamador que no la
    // envíe no borre lo que ya había. Al dejar de ser constructor sí se limpian
    // siempre, como los datos de compañía.
    const CAMPOS_CONSTRUCTOR = [
      'rbq', 'especialidad_ids', 'especialidad_todas',
      'anios_experiencia', 'zona_servicio', 'mensaje',
    ];
    // `null` = el cuerpo no traía la sección y `perfil_especialidad` no se toca.
    let especialidades: number[] | null = null;
    if (rol !== 'constructor') {
      perfilPayload['rbq']                = null;
      perfilPayload['especialidad_id']    = null;
      perfilPayload['especialidad_todas'] = false;
      perfilPayload['anios_experiencia']  = null;
      perfilPayload['zona_servicio']      = null;
      perfilPayload['mensaje']            = null;
      // Al dejar de ser constructor, la lista se borra con el resto.
      especialidades = [];
    } else if (CAMPOS_CONSTRUCTOR.some(c => c in body)) {
      const entero = (v: unknown): number | null => {
        const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : null;
      };
      const rbqLimpio = limpiar(rbq);
      if (rbqLimpio && !/^\d{4}-\d{4}-\d{2}$/.test(rbqLimpio)) {
        return fail('rbq_formato', 'El número de licencia RBQ debe tener el formato 0000-0000-00', 400);
      }
      const anios = entero(anios_experiencia);
      if (anios !== null && (anios < 0 || anios > 80)) {
        return fail('anios_experiencia_rango', 'Los años de experiencia deben estar entre 0 y 80', 400);
      }
      // Especialidades: «Todos los servicios» y una lista concreta son
      // excluyentes (lo garantiza también un CHECK en la tabla), y para el
      // constructor una de las dos es obligatoria. La lista completa vive en
      // `perfil_especialidad`; `especialidad_id` se conserva como resumen —el
      // único id elegido, o NULL si hay varios— porque hay lecturas antiguas
      // que miran esa columna.
      const todas = especialidad_todas === true;
      const ids   = todas ? [] : idsUnicos(especialidad_ids);
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
      especialidades = ids;

      perfilPayload['rbq']                = rbqLimpio;
      perfilPayload['especialidad_id']    = ids.length === 1 ? ids[0] : null;
      perfilPayload['especialidad_todas'] = todas;
      perfilPayload['anios_experiencia']  = anios;
      perfilPayload['zona_servicio']      = limpiar(zona_servicio);
      perfilPayload['mensaje']            = limpiar(mensaje);
    }

    // Dirección personal: aplica a todos los roles. Sólo se escriben las claves
    // que vengan en el cuerpo — hay llamadores (edición de cliente desde el
    // estimador) que no envían esta sección, y no deben borrarla.
    for (const campo of [
      'direccion_unidad', 'direccion_calle', 'direccion_ciudad',
      'direccion_provincia', 'direccion_codigo_postal',
    ]) {
      if (campo in body) perfilPayload[campo] = limpiar(body[campo]);
    }

    const { error: updateError } = await adminClient
      .from('perfil')
      .update(perfilPayload)
      .eq('id', id);

    if (updateError) return fail('perfil_error', updateError.message, 500, updateError.message);

    // Especialidades: se reescriben enteras, porque lo que llega es la foto
    // actual de lo que cubre este constructor y no un añadido a lo anterior.
    if (especialidades !== null) {
      const { error: errBorrado } = await adminClient
        .from('perfil_especialidad')
        .delete()
        .eq('perfil_id', id);
      if (errBorrado) return fail('perfil_error', errBorrado.message, 500, errBorrado.message);

      if (especialidades.length > 0) {
        const { error: errAlta } = await adminClient
          .from('perfil_especialidad')
          .insert(especialidades.map((servicio_id) => ({ perfil_id: id, servicio_id })));
        if (errAlta) return fail('perfil_error', errAlta.message, 500, errAlta.message);
      }
    }

    return json({ ok: true }, 200);

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
