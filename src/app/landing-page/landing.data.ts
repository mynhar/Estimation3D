/* Datos estructurales de la landing: rutas de imagen, posiciones y claves i18n.
   El texto vive en src/assets/i18n/{fr,en,es}.json bajo el espacio `landing`. */

const IMG = 'assets/landing/';

export interface Specialty {
  /** sufijo de clave i18n: landing.services.<key>_n / _t / _d */
  key: string;
  img: string;
}

export const SPECIALTIES: readonly Specialty[] = [
  { key: 'mold', img: IMG + 'mold-wall.jpg' },
  { key: 'water', img: IMG + 'mold-ceiling.jpg' },
  { key: 'asbestos', img: IMG + 'worker-profile.jpg' },
  { key: 'demolition', img: IMG + 'workers-outside.jpg' },
  { key: 'insulation', img: IMG + 'dryice.jpg' },
  { key: 'foundations', img: IMG + 'thermal.jpg' },
] as const;

/** Numeral romano + sufijo de clave para las cuatro celdas del problema. */
export const PROBLEM_CELLS: readonly { n: string; key: string }[] = [
  { n: 'i —', key: 'i' },
  { n: 'ii —', key: 'ii' },
  { n: 'iii —', key: 'iii' },
  { n: 'iv —', key: 'iv' },
] as const;

/** Sufijos de clave de las cuatro filas de cada columna de la comparación. */
export const COMPARE_ROWS = ['1', '2', '3', '4'] as const;

/** Los cuatro verbos del bloque de inmersión. */
export const IMMERSION_WORDS = ['1', '2', '3', '4'] as const;

/** Chinchetas de superficie sobre la tarjeta de escaneo del hero. */
export interface HeroPin { value: string; style: Record<string, string>; }

export const HERO_PINS: readonly HeroPin[] = [
  { value: '100', style: { top: '18%', left: '14%' } },
  { value: '177', style: { top: '30%', right: '12%' } },
  { value: '112', style: { bottom: '24%', left: '18%' } },
] as const;

/** Chinchetas de habitación sobre el plano documentado. */
export interface PlanPin { key: string; value: string; style: Record<string, string>; }

export const PLAN_PINS: readonly PlanPin[] = [
  { key: 'living', value: '142', style: { left: '24%', top: '62%' } },
  { key: 'kitchen', value: '118', style: { left: '43%', top: '46%' } },
  { key: 'hall', value: '56', style: { left: '62%', top: '54%' } },
  { key: 'bedroom', value: '134', style: { left: '80%', top: '60%' } },
] as const;

/** Especialidades que desfilan en la cinta. Se repite dos veces para el bucle. */
export const TICKER_KEYS = ['mold', 'water', 'asbestos', 'demolition', 'insulation', 'foundations'] as const;

/** Opciones del selector "type de propriété". */
export const PROPERTY_TYPES = ['house', 'apartment', 'building', 'commercial', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const MEDIA = {
  heroVideo: IMG + 'loop-gutted.mp4',
  heroPoster: IMG + 'scan-render-1.jpg',
  ctaVideo: IMG + 'loop-kitchen-after.mp4',
  ctaPoster: IMG + 'scan-render-2.jpg',
  scanCard: IMG + 'scan-dollhouse-jolicoeur.jpg',
  immersionRender: IMG + 'scan-render-1.jpg',
  planOutremont: IMG + 'scan-plan-outremont.jpg',
  planJolicoeur: IMG + 'scan-plan-jolicoeur.jpg',
} as const;

/** Anclas de la navegación interna (scroll suave dentro de la landing). */
export const NAV_ANCHORS = ['processus', 'services'] as const;
