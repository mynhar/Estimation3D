import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Lang = 'fr' | 'en' | 'es';

@Injectable({ providedIn: 'root' })
export class LangService {
  readonly langs: Lang[] = ['fr', 'en', 'es'];
  readonly current = signal<Lang>('fr');

  constructor(private translate: TranslateService) {
    const saved = (localStorage.getItem('lang') ?? 'fr') as Lang;
    const initial: Lang = this.langs.includes(saved) ? saved : 'fr';
    this.current.set(initial);
    translate.setDefaultLang('fr');
    translate.use(initial);
  }

  set(lang: Lang): void {
    this.translate.use(lang);
    this.current.set(lang);
    localStorage.setItem('lang', lang);
  }
}
