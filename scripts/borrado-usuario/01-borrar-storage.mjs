
// ============================================================================
// Borrado de ficheros físicos en Supabase Storage (bucket "archivos")
//   a) Ficheros del usuario objetivo (todo lo que cuelga de sus expedientes)
//   b) Ficheros SIN contexto / huérfanos (objetos sin fila en la tabla archivo)
//
// Proyecto: Estimation3D (ckdksfvxjimxuqceoeyr)
//
// Ejecuta ESTE script ANTES del SQL (necesita la BD intacta para saber
// qué expedientes son del usuario y qué objetos están huérfanos).
//
// Uso (el email es el ÚNICO parámetro que cambias para purgar cualquiera):
//   1) Copia .env.example a .env y pon ahí tu SUPABASE_SERVICE_ROLE_KEY.
//   2) Ejecuta (el email va como argumento):
//        node scripts/borrado-usuario/01-borrar-storage.mjs correo@ejemplo.com     # SIMULA
//        # Para borrar de verdad, pon DRY_RUN=false en el .env (o como variable).
//
// Requiere: npm i @supabase/supabase-js
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// --- Carga simple de .env (sin dependencias) --------------------------------
// Busca un archivo .env en la carpeta del script y en el directorio actual.
// Las variables ya definidas en el shell tienen prioridad sobre el .env.
function cargarEnv() {
  const aqui = dirname(fileURLToPath(import.meta.url));
  for (const ruta of [join(aqui, '.env'), join(process.cwd(), '.env')]) {
    let contenido;
    try {
      contenido = readFileSync(ruta, 'utf8');
    } catch {
      continue;
    }
    for (const linea of contenido.split(/\r?\n/)) {
      const l = linea.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i === -1) continue;
      const clave = l.slice(0, i).trim();
      let valor = l.slice(i + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  }
}
cargarEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckdksfvxjimxuqceoeyr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Email objetivo: 1º argumento de la CLI, si no la variable TARGET_EMAIL.
const TARGET_EMAIL = process.argv[2] || process.env.TARGET_EMAIL;
const BUCKET = 'archivos';

// Por seguridad, por defecto SOLO simula. Pon DRY_RUN=false para borrar de verdad.
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Prefijos del bucket a revisar en busca de huérfanos.
// 'avatares' se EXCLUYE a propósito: no se registran en la tabla archivo.
const PREFIJOS_HUERFANOS = ['expedientes', 'ofertas', 'reportes'];

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
if (!TARGET_EMAIL) {
  console.error('❌ Falta el email objetivo. Pásalo como argumento:');
  console.error('   node 01-borrar-storage.mjs correo@ejemplo.com');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Lista recursivamente todas las rutas de objetos bajo un prefijo del bucket.
async function listarRecursivo(prefijo) {
  const rutas = [];
  const pila = [prefijo];
  while (pila.length) {
    const dir = pila.pop();
    let offset = 0;
    // Paginación por si hay muchos objetos en una carpeta.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = dir ? `${dir}/${item.name}` : item.name;
        if (item.id === null) pila.push(full); // es carpeta
        else rutas.push(full);                 // es fichero
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return rutas;
}

async function removeEnLotes(rutas) {
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    if (DRY_RUN) {
      borrados += lote.length;
      continue;
    }
    const { error } = await admin.storage.from(BUCKET).remove(lote);
    if (error) throw error;
    borrados += lote.length;
  }
  return borrados;
}

async function main() {
  console.log(`\n=== Limpieza de Storage (bucket "${BUCKET}") ===`);
  console.log(DRY_RUN ? '🟡 MODO SIMULACIÓN (no se borra nada)\n' : '🔴 MODO REAL — se borrarán ficheros\n');

  // 1) Resolver usuario
  const { data: perfil, error: ePerfil } = await admin
    .from('perfil')
    .select('id, email')
    .ilike('email', TARGET_EMAIL)
    .single();
  if (ePerfil || !perfil) {
    console.error(`❌ No se encontró el usuario ${TARGET_EMAIL}:`, ePerfil?.message);
    process.exit(1);
  }
  console.log(`Usuario: ${perfil.email} (${perfil.id})`);

  // 2) Expedientes del usuario
  const { data: exps, error: eExp } = await admin
    .from('expediente')
    .select('id')
    .eq('cliente_id', perfil.id);
  if (eExp) throw eExp;
  const expIds = new Set((exps || []).map((e) => String(e.id)));
  console.log(`Expedientes del usuario: ${expIds.size}`);

  // 3) Rutas registradas en la tabla archivo (para detectar huérfanos)
  const { data: archivos, error: eArch } = await admin
    .from('archivo')
    .select('url_storage');
  if (eArch) throw eArch;
  const registradas = new Set((archivos || []).map((a) => a.url_storage));

  // 4) Enumerar objetos del bucket bajo los prefijos relevantes
  let objetos = [];
  for (const p of PREFIJOS_HUERFANOS) {
    objetos = objetos.concat(await listarRecursivo(p));
  }

  // 5a) Ficheros DEL USUARIO: objetos bajo expedientes/<id-de-sus-expedientes>/...
  const delUsuario = objetos.filter((name) => {
    const partes = name.split('/');
    return partes[0] === 'expedientes' && expIds.has(partes[1]);
  });

  // 5b) Huérfanos: objetos sin fila en archivo (excluye ya los avatares porque
  //     no están entre los prefijos analizados). Se excluyen los del usuario
  //     para no contarlos dos veces.
  const setUsuario = new Set(delUsuario);
  const huerfanos = objetos.filter((name) => !registradas.has(name) && !setUsuario.has(name));

  console.log(`\nFicheros del usuario a borrar:  ${delUsuario.length}`);
  delUsuario.forEach((n) => console.log('   · ' + n));
  console.log(`\nFicheros huérfanos a borrar:    ${huerfanos.length}`);
  huerfanos.forEach((n) => console.log('   · ' + n));

  // 6) Borrado
  const total = await removeEnLotes([...delUsuario, ...huerfanos]);
  console.log(
    `\n${DRY_RUN ? '(simulado) ' : '✅ '}${total} objeto(s) ${DRY_RUN ? 'se borrarían' : 'borrados'}.`
  );
  if (DRY_RUN) console.log('   Repite con DRY_RUN=false para ejecutar el borrado real.\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
