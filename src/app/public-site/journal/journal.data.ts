/**
 * Contenido estructural de Le Journal. Sólo identificadores: los títulos,
 * resúmenes y fechas viven en `assets/i18n/*.json` bajo `journal.*`, porque el
 * mismo artículo se publica en las tres lenguas del sitio.
 */

/** Categorías del filtro, en el orden en que se pintan. `all` va primero. */
export const JOURNAL_CATS = [
  'all', 'moisissures', 'eau', 'amiante', 'fondations', 'decider', 'histoires',
] as const;

export type JournalCat = (typeof JOURNAL_CATS)[number];

export interface JournalCard {
  /** Sufijo de las claves `journal.cards.<id>.{title,sum,meta}`. */
  readonly id: string;
  /** Categoría a la que responde el filtro; nunca `all`. */
  readonly cat: Exclude<JournalCat, 'all'>;
}

/** Las nueve fichas de la rejilla, de la más reciente a la más antigua. */
export const JOURNAL_CARDS: readonly JournalCard[] = [
  { id: 'moisissure-danger', cat: 'moisissures' },
  { id: 'degat-eau-48h',     cat: 'eau' },
  { id: 'comparer-soum',     cat: 'decider' },
  { id: 'avant-1980',        cat: 'amiante' },
  { id: 'cave-rosemont',     cat: 'histoires' },
  { id: 'fissures-fond',     cat: 'fondations' },
  { id: 'une-visite',        cat: 'decider' },
  { id: 'vermiculite',       cat: 'moisissures' },
  { id: 'assechement',       cat: 'eau' },
];
