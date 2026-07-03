// ============================================================================
// Borrado de ficheros físicos de un EXPEDIENTE en Supabase Storage
//   - Todo lo que cuelga de expedientes/<id>/... en el bucket "archivos"
//   - Además, los ficheros referenciados por filas de `archivo` ligadas al
//     expediente vía sus estimaciones / ofertas / reportes (prefijos ofertas/,
//     reportes/, etc.).
//
// Proyecto: Estimation3D (ckdksfvxjimxuqceoeyr)
//
// Ejecuta ESTE script ANTES del SQL (necesita la BD intacta para resolver el
// expediente y sus relaciones).
//
// Uso (el número de expediente es el ÚNICO parámetro):
//   1. Reutiliza el .env de scripts/borrado-usuario/ o crea uno aquí
//      (ver .env.example). Debe tener SUPABASE_SERVICE_ROLE_KEY.
//   2. node scripts/borrado-expediente/01-borrar-storage.mjs EXP-20260518-1543        # SIMULA
//      # Para borrar de verdad, DRY_RUN=false en el .env (o como variable).
//
// Requiere: npm i @supabase/supabase-js
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// --- Carga simple de .env (sin dependencias) --------------------------------
// Busca .env en: carpeta del script, directorio actual y la carpeta hermana
// scripts/borrado-usuario/ (para reutilizar la misma clave sin duplicarla).
function cargarEnv() {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const rutas = [
    join(aqui, '.env'),
    join(process.cwd(), '.env'),
    join(aqui, '..', 'borrado-usuario', '.env'),
  ];
  for (const ruta of rutas) {
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
// Número de expediente: 1er argumento de la CLI, si no la variable EXP_NUMERO.
const EXP_NUMERO = process.argv[2] || process.env.EXP_NUMERO;
const BUCKET = 'archivos';

// Por seguridad, por defecto SOLO simula. Pon DRY_RUN=false para borrar de verdad.
const DRY_RUN = process.env.DRY_RUN !== 'false';

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY en el entorno / .env.');
  process.exit(1);
}
if (!EXP_NUMERO) {
  console.error('❌ Falta el número de expediente. Pásalo como argumento:');
  console.error('   node 01-borrar-storage.mjs EXP-AAAAMMDD-XXXX');
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = dir ? `${dir}/${item.name}` : item.name;
        if (item.id === null) pila.push(full); // carpeta
        else rutas.push(full);                 // fichero
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return rutas;
}

async function idsDe(tabla, columna, valores) {
  if (!valores.length) return [];
  const { data, error } = await admin.from(tabla).select('id').in(columna, valores);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function pathsArchivoPor(columna, valores) {
  if (!valores.length) return [];
  const { data, error } = await admin.from('archivo').select('url_storage').in(columna, valores);
  if (error) throw error;
  return (data ?? []).map((a) => a.url_storage).filter(Boolean);
}

async function removeEnLotes(rutas) {
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    if (DRY_RUN) { borrados += lote.length; continue; }
    const { error } = await admin.storage.from(BUCKET).remove(lote);
    if (error) throw error;
    borrados += lote.length;
  }
  return borrados;
}

async function main() {
  console.log(`\n=== Limpieza de Storage del expediente ${EXP_NUMERO} (bucket "${BUCKET}") ===`);
  console.log(DRY_RUN ? '🟡 MODO SIMULACIÓN (no se borra nada)\n' : '🔴 MODO REAL — se borrarán ficheros\n');

  // 1) Resolver expediente
  const { data: exp, error: eExp } = await admin
    .from('expediente')
    .select('id, numero, estado')
    .eq('numero', EXP_NUMERO)
    .single();
  if (eExp || !exp) {
    console.error(`❌ No se encontró el expediente ${EXP_NUMERO}:`, eExp?.message);
    process.exit(1);
  }
  console.log(`Expediente: ${exp.numero} (${exp.id}) · estado ${exp.estado}`);

  // 2) Relaciones para localizar archivos en otros prefijos (ofertas/, reportes/)
  const estIds = await idsDe('estimacion', 'expediente_id', [exp.id]);
  const ofeIds = await idsDe('oferta', 'expediente_id', [exp.id]);
  const segIds = await idsDe('seguimiento_obra', 'expediente_id', [exp.id]);
  const repIds = await idsDe('reporte_diario', 'seguimiento_id', segIds);

  // 3) Rutas físicas a borrar
  const set = new Set();

  // 3a) Todo lo que hay bajo expedientes/<id>/ (incluye posibles huérfanos)
  (await listarRecursivo(`expedientes/${exp.id}`)).forEach((p) => set.add(p));

  // 3b) Ficheros referenciados por archivo en cualquier contexto del expediente
  (await pathsArchivoPor('expediente_id', [exp.id])).forEach((p) => set.add(p));
  (await pathsArchivoPor('estimacion_id', estIds)).forEach((p) => set.add(p));
  (await pathsArchivoPor('oferta_id', ofeIds)).forEach((p) => set.add(p));
  (await pathsArchivoPor('reporte_id', repIds)).forEach((p) => set.add(p));

  const rutas = [...set];
  console.log(`\nFicheros a borrar: ${rutas.length}`);
  rutas.forEach((n) => console.log('   · ' + n));

  const total = await removeEnLotes(rutas);
  console.log(
    `\n${DRY_RUN ? '(simulado) ' : '✅ '}${total} objeto(s) ${DRY_RUN ? 'se borrarían' : 'borrados'}.`
  );
  if (DRY_RUN) console.log('   Pon DRY_RUN=false para ejecutar el borrado real.\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
