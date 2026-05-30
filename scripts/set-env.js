/**
 * Genera src/environments/environment*.ts a partir de variables de entorno.
 * Se ejecuta como prebuild en Vercel (y en cualquier CI/CD).
 *
 * Variables requeridas en Vercel → Project Settings → Environment Variables:
 *   SUPABASE_URL       → URL del proyecto Supabase
 *   SUPABASE_ANON_KEY  → Clave anon pública del proyecto
 */

const fs   = require('fs');
const path = require('path');

const url  = process.env['SUPABASE_URL'];
const key  = process.env['SUPABASE_ANON_KEY'];

if (!url || !key) {
  console.error('\n❌  Faltan variables de entorno:\n');
  if (!url)  console.error('  SUPABASE_URL       no definida');
  if (!key)  console.error('  SUPABASE_ANON_KEY  no definida');
  console.error('\nDefínelas en Vercel → Project Settings → Environment Variables\n');
  process.exit(1);
}

const envDir = path.join(__dirname, '..', 'src', 'environments');

const production = `export const environment = {
  production: true,
  supabase: {
    url: '${url}',
    anonKey: '${key}',
  },
};
`;

const development = `export const environment = {
  production: false,
  supabase: {
    url: '${url}',
    anonKey: '${key}',
  },
};
`;

fs.writeFileSync(path.join(envDir, 'environment.production.ts'), production);
fs.writeFileSync(path.join(envDir, 'environment.ts'),            development);

console.log('✅  Archivos de entorno generados correctamente.');
