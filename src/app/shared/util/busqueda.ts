/**
 * Coincidencia de texto para los buscadores que filtran en cliente.
 *
 * Las direcciones de Quebec llevan acentos ("Montréal", "Trois-Rivières") y los
 * códigos postales se guardan con espacio ("H3B 1B4"), así que un `includes`
 * crudo falla en los dos casos más habituales.
 */

/** Minúsculas y sin acentos: "Montréal" y "Montreal" deben encontrarse igual. */
export function normalizarTexto(texto: string): string {
  // NFD separa la letra de su tilde; \p{Diacritic} elimina la tilde suelta.
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Cada término de la consulta debe aparecer, en cualquier orden y campo: así
 * "Montreal H2X" cruza ciudad y código postal. La comparación adicional sin
 * espacios permite escribir el código postal como "H2X1Y4" o "H2X 1Y4".
 */
export function coincideBusqueda(haystack: string, consulta: string): boolean {
  const h        = normalizarTexto(haystack);
  const hSinEsp  = h.replace(/\s+/g, '');
  const terminos = normalizarTexto(consulta).split(/\s+/).filter(Boolean);
  return terminos.every(t => h.includes(t) || hSinEsp.includes(t));
}

/**
 * Dirección en formato postal, repartida en dos líneas.
 * `direccion` ya combina nº de unidad, nº cívico y calle ("615-150 rue
 * Berlioz"); la segunda línea lleva ciudad, provincia y código postal.
 */
export interface DireccionPartes {
  direccion?: string | null;
  canton?:    string | null;
  provincia?: string | null;
  distrito?:  string | null;
}

export function direccionLinea1(e: DireccionPartes): string {
  return e.direccion?.trim() ?? '';
}

export function direccionLinea2(e: DireccionPartes): string {
  return [e.canton, e.provincia, e.distrito]
    .map(v => v?.trim())
    .filter(Boolean)
    .join(' ');
}

/** Dirección completa en una línea, para el `title` cuando el texto se abrevia. */
export function direccionCompleta(e: DireccionPartes): string {
  return [direccionLinea1(e), direccionLinea2(e)].filter(Boolean).join(', ');
}
