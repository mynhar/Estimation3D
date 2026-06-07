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
      return json({ error: 'No autorizado' }, 401);
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
      return json({ error: 'Token inválido o expirado' }, 401);
    }

    // 2. Verificar rol usando admin client (bypasa RLS)
    const { data: perfil } = await adminClient
      .from('perfil')
      .select('rol')
      .eq('id', user.id)
      .single();

    const callerRol = perfil?.rol;
    if (callerRol !== 'administrador' && callerRol !== 'estimador') {
      return json({ error: 'Acceso denegado: se requiere rol administrador o estimador' }, 403);
    }

    // 3. Leer y validar cuerpo
    const body = await req.json();
    const { email, password, nombre, apellido, telefono, avatar_url, rol, activo } = body;

    if (!email || !password || !nombre || !apellido || !rol) {
      return json({ error: 'Campos requeridos: email, password, nombre, apellido, rol' }, 400);
    }

    // El estimador solo puede crear clientes
    if (callerRol === 'estimador' && rol !== 'cliente') {
      return json({ error: 'Acceso denegado: el estimador solo puede crear usuarios con rol cliente' }, 403);
    }

    const perfil_completo = !!(nombre && apellido && telefono && avatar_url);

    // 4. Crear en auth.users
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido, telefono },
    });

    if (authError) {
      return json({ error: authError.message }, 400);
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
    });

    if (upsertError) {
      // Rollback
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: upsertError.message }, 500);
    }

    return json({ id: userId }, 201);

  } catch (err: any) {
    return json({ error: err.message ?? 'Error interno' }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...{ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }, 'Content-Type': 'application/json' },
  });
}
