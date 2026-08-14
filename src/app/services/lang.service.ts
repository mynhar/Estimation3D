import { Injectable, Injector, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from './auth-supabase.service';

export type Lang = 'fr' | 'en' | 'es';

const LANGS: Lang[] = ['fr', 'en', 'es'];

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem('lang') as Lang | null;
    return v && LANGS.includes(v) ? v : 'fr';
  } catch {
    return 'fr';
  }
}

@Injectable({ providedIn: 'root' })
export class LangService {
  private translate = inject(TranslateService);
  // AuthSupabaseService se resuelve tarde, dentro de `set()`. Inyectarlo aquí
  // forzaría a construirlo durante el arranque (LangService se instancia en la
  // raíz), y su constructor registra el listener de auth y puede navegar.
  private injector = inject(Injector);

  readonly langs   = LANGS;
  readonly current = signal<Lang>('fr');

  constructor() {
    const initial = readStoredLang();
    this.current.set(initial);
    this.translate.setDefaultLang('fr');
    this.translate.use(initial);
  }

  set(lang: Lang): void {
    this.translate.use(lang);
    this.current.set(lang);
    try { localStorage.setItem('lang', lang); } catch { /* private mode */ }
    void this.persistirEnPerfil(lang);
  }

  /**
   * Guarda el idioma en `perfil.idioma`. `localStorage` sólo vive en este
   * navegador; el servidor necesita el dato para escribirle al usuario en su
   * idioma (p. ej. la edge function enviar-credenciales).
   *
   * Silencioso a propósito: cambiar de idioma no debe fallar por esto — sin
   * sesión (pantalla de login) no hay a quién guardárselo.
   */
  private async persistirEnPerfil(lang: Lang): Promise<void> {
    try {
      const auth = this.injector.get(AuthSupabaseService);
      const { data } = await auth.client.auth.getSession();
      const id = data.session?.user?.id;
      if (!id) return;
      await auth.client.from('perfil').update({ idioma: lang }).eq('id', id);
    } catch { /* sin sesión o sin red: el idioma sigue vivo en localStorage */ }
  }
}
