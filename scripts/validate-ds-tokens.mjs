#!/usr/bin/env node
/**
 * Valida que cada referencia `var(--ds-*)` en los CSS de componentes
 * exista realmente como token definido en src/styles/tokens.css.
 *
 * Captura el bug "token fantasma" (p. ej. var(--ds-accent) cuando el token
 * real es --ds-gold) que stylelint no detecta sin plugins ruidosos.
 * Solo inspecciona el prefijo --ds-, así que nunca da falsos positivos con
 * variables locales de componente (--sb-*, --acento, --estado-color, …).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TOKENS_FILE = join(ROOT, 'src/styles/tokens.css');
const SCAN_DIR = join(ROOT, 'src/app');

// 1. Recolectar los tokens --ds-* definidos (líneas "  --ds-foo: valor;")
const defined = new Set();
const tokensCss = readFileSync(TOKENS_FILE, 'utf8');
for (const m of tokensCss.matchAll(/(--ds-[a-z0-9-]+)\s*:/gi)) {
  defined.add(m[1]);
}

// 2. Recorrer recursivamente los .css y comprobar cada var(--ds-*)
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(SCAN_DIR)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--ds-[a-z0-9-]+)/gi)) {
      const tok = m[1];
      if (!defined.has(tok)) {
        violations.push({ file: relative(ROOT, file), line: i + 1, tok });
      }
    }
  });
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} referencia(s) a token --ds-* inexistente:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.tok}`);
  }
  console.error(`\n(${defined.size} tokens válidos en src/styles/tokens.css)\n`);
  process.exit(1);
}

console.log(`✓ Tokens --ds-* OK — ${defined.size} definidos, todas las referencias resuelven.`);
