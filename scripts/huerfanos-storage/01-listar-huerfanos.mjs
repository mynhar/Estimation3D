// ============================================================================
// Huérfanos de Storage bajo "ofertas/" — inventario y limpieza
//
// Qué es un huérfano: un fichero en el bucket "archivos" cuya ruta es
// ofertas/<oferta_id>/... pero cuyo <oferta_id> ya no existe en la tabla
// `oferta`. Aparecieron porque `eliminar_oferta_admin` hacía DELETE físico y
// `removeFromStorage()` se tragaba los errores: las filas desaparecían y los
// ficheros se quedaban.
//
// A partir de la migración 20260924 las ofertas se dan de baja lógicamente, así
// que esto NO se va a repetir. Este script sirve para el pasivo acumulado.
//
// IMPORTANTE — estos ficheros son la ÚNICA prueba que queda de las ofertas
// borradas antes de la migración. Léelos antes de borrarlos: el PDF del devis
// es lo que permite recrear la oferta a mano.
//
// Proyecto: Estimation3D (ckdksfvxjimxuqceoeyr)
//
// Uso:
//   1. Reutiliza el .env de scripts/borrado-usuario/ o crea uno aquí
//      (ver scripts/borrado-usuario/.env.example). Necesita SUPABASE_SERVICE_ROLE_KEY.
//   2. node scripts/huerfanos-storage/01-listar-huerfanos.mjs
//        → inventario con URL firmada de descarga. NO borra nada.
//   3. node scripts/huerfanos-storage/01-listar-huerfanos.mjs --borrar
//        → borra. Exige además DRY_RUN=false en el entorno: dos cerrojos, porque
//          esto destruye pruebas que no se pueden regenerar.
//
// Requiere: npm i @supabase/supabase-js
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BUCKET = 'archivos';
const PREFIJO = 'ofertas';
/** Validez de las URL de descarga que imprime el inventario. */
const FIRMA_SEGUNDOS = 60 * 60 * 24 * 7;

// --- Carga simple de .env (sin dependencias) --------------------------------
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

const URL = process.env['SUPABASE_URL'];
const KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const BORRAR = process.argv.includes('--borrar');
const DRY_RUN = process.env['DRY_RUN'] !== 'false';

if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Ver scripts/borrado-usuario/.env.example');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Recorre recursivamente ofertas/** y devuelve todas las rutas de fichero. */
async function listarRutas(prefijo) {
  const rutas = [];
  const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000 });
  if (error) throw new Error(`list(${prefijo}): ${error.message}`);
  for (const entrada of data ?? []) {
    const ruta = `${prefijo}/${entrada.name}`;
    // Supabase marca las carpetas con id/metadata nulos.
    if (entrada.id === null) rutas.push(...await listarRutas(ruta));
    else rutas.push(ruta);
  }
  return rutas;
}

async function main() {
  console.log(`Bucket "${BUCKET}", prefijo "${PREFIJO}/"\n`);

  const rutas = await listarRutas(PREFIJO);
  if (!rutas.length) {
    console.log('No hay ficheros bajo ofertas/. Nada que hacer.');
    return;
  }

  const idsEnStorage = [...new Set(rutas.map(r => r.split('/')[1]).filter(Boolean))];

  const { data: vivas, error } = await db
    .from('oferta')
    .select('id')
    .in('id', idsEnStorage);
  if (error) throw new Error(`select oferta: ${error.message}`);

  const existen = new Set((vivas ?? []).map(o => o.id));
  const huerfanas = idsEnStorage.filter(id => !existen.has(id));
  const rutasHuerfanas = rutas.filter(r => huerfanas.includes(r.split('/')[1]));

  console.log(`Carpetas de oferta en storage : ${idsEnStorage.length}`);
  console.log(`Con fila en la tabla oferta   : ${existen.size}`);
  console.log(`HUÉRFANAS                     : ${huerfanas.length}`);
  console.log(`Ficheros huérfanos            : ${rutasHuerfanas.length}\n`);

  if (!rutasHuerfanas.length) return;

  for (const ruta of rutasHuerfanas) {
    const { data: firma } = await db.storage.from(BUCKET).createSignedUrl(ruta, FIRMA_SEGUNDOS);
    console.log(`  ${ruta}`);
    if (firma?.signedUrl) console.log(`    ↳ ${firma.signedUrl}\n`);
  }

  if (!BORRAR) {
    console.log('Sólo inventario. Para borrar: --borrar y DRY_RUN=false.');
    console.log('Descarga antes lo que quieras conservar: esto no se puede deshacer.');
    return;
  }

  if (DRY_RUN) {
    console.log('--borrar recibido, pero DRY_RUN sigue activo. No se ha borrado nada.');
    console.log('Pon DRY_RUN=false en el entorno para confirmar.');
    return;
  }

  const { data: borrados, error: errBorrado } = await db.storage.from(BUCKET).remove(rutasHuerfanas);
  if (errBorrado) throw new Error(`remove: ${errBorrado.message}`);
  console.log(`Borrados ${borrados?.length ?? 0} de ${rutasHuerfanas.length} ficheros.`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
