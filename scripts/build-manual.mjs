/**
 * Genera el PDF del manual de usuario a partir de su Markdown.
 *
 *   npm run manual                 español  → docs/MANUAL_DE_USUARIO.pdf
 *   npm run manual:fr              francés  → docs/MANUEL_UTILISATEUR.pdf
 *   npm run manual -- --html       conserva el HTML intermedio para depurar
 *
 * El Markdown es la única fuente: el PDF es un artefacto derivado. Las
 * tipografías se leen de docs/fonts/, así que la generación funciona sin
 * conexión y no cambia de aspecto según haya red o no.
 *
 * Las capturas de docs/img/ se incrustan si el archivo existe; si falta, queda
 * un recuadro con el nombre esperado. No hay que tocar el manual para eso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer-core';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_FUENTES = path.join(RAIZ, 'docs', 'fonts');
const CONSERVAR_HTML = process.argv.includes('--html');

/* ---------- idiomas ---------- */

// Cada manual comparte maquetación y estilos; sólo cambian el archivo fuente y
// los rótulos que el script genera por su cuenta (recuadros, pie de página).
const IDIOMAS = {
  es: {
    lang: 'es',
    md: 'MANUAL_DE_USUARIO.md',
    pdf: 'MANUAL_DE_USUARIO.pdf',
    titulo: 'Estimation3D — Manual de usuario',
    pie: 'Estimation3D · Manual de usuario',
    callouts: { nota: 'Nota', aviso: 'Atención' },
    renglonesPropios: ['Causa:', 'Qué hacer:'],
    capturaPendiente: 'Captura pendiente',
  },
  fr: {
    lang: 'fr-CA',
    md: 'MANUEL_UTILISATEUR.md',
    pdf: 'MANUEL_UTILISATEUR.pdf',
    titulo: "Estimation3D — Manuel de l'utilisateur",
    pie: "Estimation3D · Manuel de l'utilisateur",
    callouts: { nota: 'Note', aviso: 'Attention' },
    renglonesPropios: ['Cause :', 'Que faire :'],
    capturaPendiente: 'Capture à venir',
    // Tipografía francesa: la ponctuation double lleva espacio insecable
    // delante. Se sustituye el espacio ya escrito, nunca se añade uno nuevo,
    // para no alterar las cadenas citadas literalmente de la interfaz.
    tipografia: (html) =>
      html.replace(/>([^<]+)</g, (_, txt) =>
        '>' + txt.replace(/ ([:;!?»])/g, '&nbsp;$1').replace(/« /g, '«&nbsp;') + '<'
      ),
  },
};

const pedido = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=es').slice(7);
const CFG = IDIOMAS[pedido];
if (!CFG) {
  throw new Error(`Idioma desconocido: ${pedido}. Disponibles: ${Object.keys(IDIOMAS).join(', ')}.`);
}

const MD = path.join(RAIZ, 'docs', CFG.md);
const PDF = path.join(RAIZ, 'docs', CFG.pdf);
const HTML = path.join(RAIZ, 'docs', `.manual.${pedido}.build.html`);

const urlArchivo = (p) => 'file:///' + p.replace(/\\/g, '/');

/* ---------- navegador ---------- */

function buscarNavegador() {
  const candidatos = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const hallado = candidatos.find((c) => fs.existsSync(c));
  if (!hallado) {
    throw new Error(
      'No se encontró Chrome ni Edge. Indique la ruta en la variable PUPPETEER_EXECUTABLE_PATH.'
    );
  }
  return hallado;
}

/* ---------- Markdown ---------- */

// Anclas al estilo GitHub, para que los enlaces del índice funcionen dentro del PDF.
const slug = (texto) =>
  texto
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE_RENGLON = new RegExp(`\\n(?=(${[...CFG.renglonesPropios.map(escapar), '<strong>'].join('|')}))`, 'g');
const RE_CALLOUT = new RegExp(
  `^<p[^>]*><strong>(${escapar(CFG.callouts.nota)}|${escapar(CFG.callouts.aviso)})<\\/strong>\\s*(?:<br>)?\\s*`
);

function convertir(fuente) {
  let html = md.render(fuente);

  // Encabezados con id, derivados del texto visible.
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, n, txt) => `<h${n} id="${slug(txt)}">${txt}</h${n}>`);

  // El índice trae los destinos percent-encodeados; las anclas conservan los
  // acentos tal cual. Se decodifican para que ambos coincidan.
  html = html.replace(/href="#([^"]+)"/g, (orig, destino) => {
    try {
      return `href="#${decodeURIComponent(destino)}"`;
    } catch {
      return orig;
    }
  });

  // Saltos de línea deliberados: las fichas de la sección de problemas escriben
  // "Causa:" y "Qué hacer:" en renglones propios, pero el resto de los párrafos
  // va plegado a 80 columnas y debe fluir.
  // En los bloques centrados (portada y cierre) cada renglón va en su línea.
  const iniCentro = html.indexOf('<div align="center">');
  const finCentro = iniCentro >= 0 ? html.indexOf('</div>', iniCentro) : -1;

  html = html.replace(/<p>([\s\S]*?)<\/p>/g, (_, dentro, pos) => {
    const centrado = iniCentro >= 0 && pos > iniCentro && pos < finCentro;
    const cuerpo = centrado
      ? dentro.replace(/\n/g, '<br>').trim()
      : dentro.replace(RE_RENGLON, '<br>').replace(/\n/g, ' ').trim();
    const soloRotulo = /^<strong>[^<]*<\/strong>$/.test(cuerpo);
    return `<p${soloRotulo ? ' class="rotulo"' : ''}>${cuerpo}</p>`;
  });

  // Citas que abren con el rótulo de nota o de aviso: recuadros con su propio tono.
  html = html.replace(/<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/g, (_, dentro) => {
    const m = dentro.match(RE_CALLOUT);
    if (!m) return `<div class="callout cita">${dentro}</div>`;
    const tipo = m[1] === CFG.callouts.nota ? 'nota' : 'aviso';
    const resto = dentro.slice(m[0].length);
    return `<div class="callout ${tipo}"><p class="callout-t">${m[1]}</p><p>${resto}</div>`;
  });

  // Capturas: se incrusta la imagen si existe; si no, queda constancia de cuál falta.
  let presentes = 0;
  let ausentes = 0;
  html = html.replace(/<img src="([^"]+)" alt="([^"]*)"[^>]*>/g, (_, src, alt) => {
    const abs = path.resolve(path.dirname(MD), src);
    const nombre = src.split('/').pop();
    if (fs.existsSync(abs)) {
      presentes++;
      return `<figure class="shot"><img src="${urlArchivo(abs)}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`;
    }
    ausentes++;
    return (
      '<figure class="shot pendiente"><div class="marco">' +
      `<span class="tag">${CFG.capturaPendiente}</span>` +
      `<span class="cap">${alt}</span><span class="file">${nombre}</span></div></figure>`
    );
  });

  // Portada y cierre: se marcan por clase, no por posición.
  const centrados = [...html.matchAll(/<div align="center">/g)];
  if (centrados.length) {
    html = html.replace('<div align="center">', '<div align="center" class="portada">');
    if (centrados.length > 1) {
      const i = html.lastIndexOf('<div align="center">');
      html = html.slice(0, i) + '<div align="center" class="cierre">' + html.slice(i + '<div align="center">'.length);
    }
  }

  // Última pasada: convenciones tipográficas propias del idioma, ya sobre el
  // HTML final y sólo en el texto visible, nunca dentro de las etiquetas.
  if (CFG.tipografia) html = CFG.tipografia(html);

  return { html, presentes, ausentes };
}

/* ---------- estilos ---------- */

function estilos() {
  const cssFuentes = fs.existsSync(path.join(DIR_FUENTES, 'fonts.css'))
    ? fs
        .readFileSync(path.join(DIR_FUENTES, 'fonts.css'), 'utf8')
        .replace(/url\(([^)]+\.woff2)\)/g, (_, f) => `url(${urlArchivo(path.join(DIR_FUENTES, f))})`)
    : '';

  if (!cssFuentes) {
    console.warn('  aviso: falta docs/fonts/fonts.css; se usarán tipografías del sistema.');
  }

  return `${cssFuentes}
:root{
  --ds-bg:#F5F3EE; --ds-bg-alt:#EFEDE6; --ds-surface:#FBFAF6;
  --ds-ink:#1A1A1A; --ds-ink-soft:#4A4742; --ds-ink-mute:#6E6A63;
  --ds-accent:#D4B96E; --ds-line:rgba(26,26,26,.12);
}
@page{ size:A4; margin:17mm 16mm 15mm; }
*{ box-sizing:border-box; }
body{
  margin:0; background:#fff; color:var(--ds-ink);
  font-family:"DM Sans",-apple-system,"Segoe UI",sans-serif;
  font-size:10.2pt; line-height:1.55;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
h1,h2,h3,h4{ font-family:"Fraunces",Georgia,"Times New Roman",serif; font-weight:600; }
h1{ display:none; }
h2{
  font-size:17pt; margin:0 0 5mm; padding-bottom:2.5mm;
  border-bottom:2px solid var(--ds-accent); break-before:page; break-after:avoid;
}
h3{ font-size:12.5pt; margin:8mm 0 3mm; break-after:avoid; }
h3::before{ content:""; display:block; width:14mm; height:2px; background:var(--ds-accent); margin-bottom:2.5mm; }
p{ margin:0 0 3mm; orphans:2; widows:2; }
p.rotulo{ font-family:"Fraunces",Georgia,serif; font-size:11pt; margin:6mm 0 2.5mm; break-after:avoid; }
a{ color:var(--ds-ink); text-decoration:none; border-bottom:1px solid var(--ds-accent); }
hr{ border:0; border-top:1px solid var(--ds-line); margin:7mm 0; }
code{
  font-family:"Cascadia Mono",Consolas,monospace; font-size:.88em;
  background:var(--ds-bg-alt); border:1px solid var(--ds-line); border-radius:4px;
  padding:.5mm 1.2mm; white-space:normal; overflow-wrap:break-word;
}
ol,ul{ margin:0 0 4mm; padding-left:6mm; }
li{ margin-bottom:1.6mm; break-inside:avoid; }
li > ul{ margin:1.6mm 0 0; padding-left:5mm; list-style:none; }
li > ul li::before{ content:"·"; color:var(--ds-accent); margin-right:2mm; }
table{ width:100%; border-collapse:collapse; margin:0 0 5mm; font-size:8.9pt; }
thead{ display:table-header-group; }
th{
  background:var(--ds-bg-alt); font-family:"Fraunces",Georgia,serif; font-weight:600;
  font-size:9pt; text-align:left; padding:2mm 2.5mm; border-bottom:1.5px solid var(--ds-accent);
}
td{ padding:1.8mm 2.5mm; border-bottom:1px solid var(--ds-line); vertical-align:top; }
td,th{ overflow-wrap:break-word; }
td:first-child{ min-width:26mm; }
tr{ break-inside:avoid; }
tbody tr:nth-child(even){ background:var(--ds-surface); }
.callout{
  background:var(--ds-surface); border:1px solid var(--ds-line); border-left:3px solid var(--ds-accent);
  border-radius:6px; padding:3mm 4mm; margin:0 0 5mm; break-inside:avoid;
}
.callout.aviso{ background:#FAF4E8; border-left-color:#B08B2E; }
.callout p{ margin:0 0 2mm; font-size:9.6pt; color:var(--ds-ink-soft); }
.callout p:last-child{ margin-bottom:0; }
.callout-t{
  font-family:"Fraunces",Georgia,serif; font-weight:600; font-size:10pt;
  color:var(--ds-ink) !important; letter-spacing:.02em;
}
.callout.aviso .callout-t{ color:#7A5E12 !important; }
figure.shot{ margin:0 0 5mm; break-inside:avoid; }
figure.shot img{ max-width:100%; border:1px solid var(--ds-line); border-radius:6px; }
figcaption{ font-size:8.6pt; color:var(--ds-ink-mute); margin-top:1.5mm; }
.pendiente .marco{
  border:1px dashed rgba(26,26,26,.25); border-radius:6px; background:var(--ds-bg);
  padding:6mm 4mm; text-align:center; display:flex; flex-direction:column; gap:1.5mm;
}
.pendiente .tag{ font-size:7.4pt; letter-spacing:.14em; text-transform:uppercase; color:#7A5E12; }
.pendiente .cap{ font-family:"Fraunces",Georgia,serif; font-size:10pt; }
.pendiente .file{ font-family:Consolas,monospace; font-size:8pt; color:var(--ds-ink-mute); }
.portada{
  height:265mm; background:var(--ds-bg); border-radius:8px; padding:0 20mm;
  display:flex; flex-direction:column; justify-content:center; break-after:page;
}
.portada p{ text-align:center; font-size:10.5pt; color:var(--ds-ink-soft); margin-bottom:1.5mm; }
.portada::before{
  content:"Estimation3D"; display:block; text-align:center;
  font-family:"Fraunces",Georgia,serif; font-size:34pt; font-weight:600; margin-bottom:3mm;
}
.portada::after{ content:""; display:block; width:30mm; height:3px; background:var(--ds-accent); margin:8mm auto 0; }
.portada p:first-of-type{
  font-family:"Fraunces",Georgia,serif; font-size:15pt; color:var(--ds-ink-soft); margin-bottom:14mm;
}
.cierre{
  margin-top:12mm; padding-top:6mm; border-top:1px solid var(--ds-line);
  text-align:center; color:var(--ds-ink-mute); font-size:9pt;
}
.cierre p:first-child{ font-family:"Fraunces",Georgia,serif; font-size:12pt; color:var(--ds-ink); }`;
}

/* ---------- generación ---------- */

const inicio = Date.now();
const fuente = fs.readFileSync(MD, 'utf8').replace(/\r\n/g, '\n');
const { html, presentes, ausentes } = convertir(fuente);

fs.writeFileSync(
  HTML,
  `<!doctype html><html lang="${CFG.lang}"><head><meta charset="utf-8">
<title>${CFG.titulo}</title>
<style>${estilos()}</style></head><body>
${html}
</body></html>`,
  'utf8'
);

const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const pagina = await navegador.newPage();
  await pagina.goto(urlArchivo(HTML), { waitUntil: 'networkidle0' });
  await pagina.evaluateHandle('document.fonts.ready');

  // Un fonts.css malformado invalida la hoja entera sin dar error: se comprueba.
  const tipografiasOk = await pagina.evaluate(
    () => document.fonts.check('12pt Fraunces') && document.fonts.check('12pt "DM Sans"')
  );
  if (!tipografiasOk) {
    throw new Error('Fraunces o DM Sans no cargaron. Ejecute: node scripts/fetch-manual-fonts.mjs');
  }

  const pie =
    '<div style="width:100%;padding:0 16mm;font-family:sans-serif;font-size:7.5pt;color:#6E6A63;' +
    'display:flex;justify-content:space-between;align-items:center;">' +
    `<span>${CFG.pie}</span>` +
    '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>';

  await pagina.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: pie,
    margin: { top: '17mm', right: '16mm', bottom: '15mm', left: '16mm' },
  });
} finally {
  await navegador.close();
  if (!CONSERVAR_HTML) fs.rmSync(HTML, { force: true });
}

const kb = fs.statSync(PDF).size / 1024;
const paginas = (fs.readFileSync(PDF).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

console.log(`\n  docs/${CFG.pdf}`);
console.log(`  ${paginas} páginas · ${kb.toFixed(0)} KB · ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
console.log(`  capturas: ${presentes} incrustadas, ${ausentes} pendientes en docs/img/`);
if (CONSERVAR_HTML) console.log(`  HTML conservado en ${path.relative(RAIZ, HTML)}`);
