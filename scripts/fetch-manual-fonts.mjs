/**
 * Descarga Fraunces y DM Sans desde Google Fonts a docs/fonts/ y deja un
 * fonts.css con rutas locales, para que la generación del PDF no dependa de la
 * red ni cambie de tipografía según haya conexión o no.
 *
 *   node scripts/fetch-manual-fonts.mjs
 *
 * Sólo hay que volver a ejecutarlo si se borra docs/fonts/ o si cambian las
 * tipografías del sistema de diseño.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(RAIZ, 'docs', 'fonts');
// Google devuelve woff2 sólo si el User-Agent es el de un navegador moderno.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_CSS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=DM+Sans:opsz,wght@9..40,400..700&display=swap';
const SUBSETS = ['latin', 'latin-ext'];

await fs.mkdir(DEST, { recursive: true });

const css = await (await fetch(URL_CSS, { headers: { 'User-Agent': UA } })).text();

// Google antepone a cada bloque un comentario con el subconjunto: /* latin */
const bloques = css.split('/*').slice(1);
const salida = [];

for (const b of bloques) {
  const subset = b.slice(0, b.indexOf('*/')).trim();
  if (!SUBSETS.includes(subset)) continue;

  const cuerpo = b.slice(b.indexOf('*/') + 2).trim(); // incluye ya su propio @font-face { … }
  const familia = (cuerpo.match(/font-family:\s*'([^']+)'/) || [])[1] || 'fuente';
  const url = (cuerpo.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
  if (!url) continue;

  const nombre = `${familia.toLowerCase().replace(/\s+/g, '-')}-${subset}.woff2`;
  const bin = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  await fs.writeFile(path.join(DEST, nombre), bin);
  console.log(`  ${nombre.padEnd(28)} ${(bin.length / 1024).toFixed(0)} KB`);

  salida.push(`/* ${familia} — ${subset} */\n${cuerpo.replace(url, nombre)}`);
}

if (!salida.length) throw new Error('Google Fonts no devolvió ningún bloque utilizable.');

await fs.writeFile(path.join(DEST, 'fonts.css'), salida.join('\n\n') + '\n', 'utf8');
console.log(`\n${salida.length} tipografías en docs/fonts/ + fonts.css`);
