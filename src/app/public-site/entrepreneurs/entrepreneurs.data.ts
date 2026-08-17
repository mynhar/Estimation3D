/**
 * Contenido estructural de la página Entrepreneurs. Igual que en Le Journal,
 * aquí sólo viven identificadores y numerales: el texto está en
 * `assets/i18n/*.json` bajo `entrepreneurs.*`.
 *
 * Los numerales son romanos y forman parte del diseño (no son un contador
 * automático), por eso viajan con el dato y no se derivan del índice.
 */

export interface NumberedItem {
  /** Sufijo de las claves de i18n del bloque. */
  readonly id: string;
  /** Numeral tal cual se pinta: "i —", "I.", … */
  readonly n: string;
}

/** [01] El problema — cuatro celdas. */
export const PROBLEM_CELLS: readonly NumberedItem[] = [
  { id: 'estimer',    n: 'i —' },
  { id: 'temps',      n: 'ii —' },
  { id: 'opaque',     n: 'iii —' },
  { id: 'visibilite', n: 'iv —' },
];

/** [02] El proceso — cuatro etapas. */
export const STEPS: readonly NumberedItem[] = [
  { id: 'dossier',    n: 'I.' },
  { id: 'soumission', n: 'II.' },
  { id: 'execution',  n: 'III.' },
  { id: 'paiement',   n: 'IV.' },
];

/** [03] Lo que obtiene — seis ventajas. */
export const BENEFITS: readonly NumberedItem[] = [
  { id: 'prequalifies',   n: 'i —' },
  { id: 'sans-visite',    n: 'ii —' },
  { id: 'concurrence',    n: 'iii —' },
  { id: 'documentation',  n: 'iv —' },
  { id: 'suivi',          n: 'v —' },
  { id: 'reputation',     n: 'vi —' },
];

/** [04] Exigencias — seis líneas con marca de verificación. */
export const REQUIREMENTS: readonly string[] = [
  'rbq', 'assurance', 'certifications', 'rapports', 'protocoles', 'disponibilite',
];

export interface SpecialtySlot extends NumberedItem {
  /**
   * Sufijo de `entrepreneurs.specs.avail.*`. `full` pinta la píldora apagada:
   * es el único estado que no ofrece plaza.
   */
  readonly avail: 'p1' | 'p2' | 'p3' | 'full';
}

/** [05] Seis dominios y sus plazas del piloto 2026. */
export const SPECIALTY_SLOTS: readonly SpecialtySlot[] = [
  { id: 'moisissures', n: 'I.',   avail: 'p2' },
  { id: 'eau',         n: 'II.',  avail: 'p3' },
  { id: 'amiante',     n: 'III.', avail: 'p1' },
  { id: 'demolition',  n: 'IV.',  avail: 'full' },
  { id: 'isolation',   n: 'V.',   avail: 'p2' },
  { id: 'fondations',  n: 'VI.',  avail: 'p1' },
];

/** [06] Preguntas frecuentes, en el orden en que se muestran. */
export const FAQ_IDS: readonly string[] = [
  'cout', 'attribution', 'obligation', 'paiement', 'imprevu',
];

/** [07] Casillas de especialidad del formulario de candidatura. */
export const FORM_SPECIALTIES: readonly string[] = [
  'moisissures', 'amiante', 'eau', 'demolition', 'isolation', 'fondations',
];
