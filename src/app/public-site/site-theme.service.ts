import { Injectable, effect, signal } from '@angular/core';

export type SiteTheme = 'dark' | 'light';

/** Clave propia: el tema del sitio público es independiente del de la app. */
const THEME_KEY = 'e3-landing-theme';

/**
 * Tema visual (oscuro / claro) compartido por las páginas públicas: landing,
 * Le Journal y Entrepreneurs. Vive en un servicio y no en cada componente para
 * que el conmutador de una página se recuerde al navegar a otra dentro de la
 * misma sesión, sin pasar por localStorage en cada render.
 *
 * No toca `<html>` ni `<body>`: cada página lo refleja como atributo de su
 * propio host, de modo que la parte autenticada de la aplicación nunca cambia.
 */
@Injectable({ providedIn: 'root' })
export class SiteThemeService {
  readonly theme = signal<SiteTheme>(restore());

  constructor() {
    effect(() => {
      try { localStorage.setItem(THEME_KEY, this.theme()); } catch { /* modo privado */ }
    });
  }

  set(t: SiteTheme): void { this.theme.set(t); }
}

function restore(): SiteTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
