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
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return json({ error: 'Token inválido o expirado' }, 401);

    // Verificar rol administrador
    const { data: caller } = await adminClient
      .from('perfil')
      .select('rol')
      .eq('id', user.id)
      .single();

    if (caller?.rol !== 'administrador') {
      return json({ error: 'Acceso denegado: se requiere rol administrador' }, 403);
    }

    // Leer cuerpo
    const body = await req.json();
    const { id, nombre, apellido, telefono, avatar_url, rol, activo, email, password } = body;

    if (!id || !nombre || !apellido || !rol) {
      return json({ error: 'Campos requeridos: id, nombre, apellido, rol' }, 400);
    }

    // Actualizar email y/o contraseña en auth.users (solo si se enviaron)
    if (email || password) {
      const authUpdate: { email?: string; password?: string } = {};
      if (email)    authUpdate.email    = email;
      if (password) authUpdate.password = password;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(id, authUpdate);
      if (authUpdateError) return json({ error: authUpdateError.message }, 400);
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

    const { error: updateError } = await adminClient
      .from('perfil')
      .update(perfilPayload)
      .eq('id', id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true }, 200);

  } catch (err: any) {
    return json({ error: err.message ?? 'Error interno' }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
