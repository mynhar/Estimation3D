/** Convierte un texto separado por comas en un arreglo limpio de palabras clave. */
export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Une un arreglo de palabras clave en un texto separado por comas para el input. */
export function joinKeywords(list: string[] | null | undefined): string {
  return (list ?? []).join(', ');
}
