import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

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
  }
}
