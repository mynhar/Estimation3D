/**
 * Utilidades para derivar la miniatura pública de un tour 3D Matterport a partir
 * del campo `estimacion.url_tour` (URL simple o lista JSON serializada).
 */

/** Extrae las URLs de `url_tour` (URL simple o lista JSON serializada). */
export function parseTourUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
  } catch { /* no era JSON */ }
  return [raw];
}

/**
 * Miniatura pública de un tour Matterport a partir de su URL (`?m=<modelId>`).
 * Endpoint público de imagen de Matterport (302 → JPEG en su CDN). Devuelve null
 * si la URL no contiene un model id reconocible.
 */
export function matterportThumb(tourUrl: string | undefined): string | null {
  if (!tourUrl) return null;
  const id = tourUrl.match(/[?&]m=([A-Za-z0-9]+)/)?.[1];
  if (!id) return null;
  return `https://my.matterport.com/api/v1/player/models/${id}/thumb?width=640&dpr=1&disable=upscale`;
}

/** Atajo: miniatura a partir del valor crudo de `url_tour` (primer tour). */
export function matterportThumbFromTour(raw: string | null | undefined): string | null {
  return matterportThumb(parseTourUrls(raw)[0]);
}
