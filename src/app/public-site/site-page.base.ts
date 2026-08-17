import {
  Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject, signal,
} from '@angular/core';

import { Lang, LangService } from '../services/lang.service';
import { SiteTheme, SiteThemeService } from './site-theme.service';

/**
 * Armazón común de las páginas públicas secundarias (Le Journal, Entrepreneurs):
 * estado de la cabecera al hacer scroll, menú móvil y los dos conmutadores
 * flotantes. Es la contrapartida en TypeScript de `styles/site-chrome.css`.
 *
 * `@Directive()` sin selector es la forma que Angular reserva para clases base
 * abstractas con inyección y ciclo de vida; sin el decorador el compilador
 * rechaza el `ngOnDestroy` heredado.
 *
 * La landing no extiende esta clase: su cabecera lleva además barra de progreso
 * y scan-spy de secciones, y su listener de scroll ya hace ese trabajo.
 */
@Directive()
export abstract class SitePageBase implements OnDestroy {
  private zone = inject(NgZone);

  protected host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  readonly lang = inject(LangService);
  readonly langs = this.lang.langs;
  private themeSvc = inject(SiteThemeService);
  readonly theme = this.themeSvc.theme;

  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);

  private removeScroll?: () => void;

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.bindScroll()));
  }

  /**
   * La cabecera se vuelve opaca pasados 40 px. El listener corre fuera de la
   * zona y sólo vuelve a entrar cuando el booleano cambia de verdad: si no,
   * cada píxel de scroll dispararía una detección de cambios completa.
   */
  private bindScroll(): void {
    const onScroll = () => {
      const isScrolled = window.scrollY > 40;
      if (isScrolled !== this.scrolled()) {
        this.zone.run(() => this.scrolled.set(isScrolled));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.removeScroll = () => window.removeEventListener('scroll', onScroll);
    onScroll();
  }

  setLang(l: Lang): void { this.lang.set(l); }

  setTheme(t: SiteTheme): void { this.themeSvc.set(t); }

  toggleMenu(): void { this.menuOpen.update(v => !v); }

  closeMenu(): void { this.menuOpen.set(false); }

  /**
   * Desplazamiento suave a una sección de la propia página. Se busca dentro del
   * host y no en `document`: la parte autenticada de la app puede tener ids
   * iguales montados a la vez.
   */
  goTo(id: string, event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    const el = this.host.querySelector<HTMLElement>('#' + id);
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  ngOnDestroy(): void {
    this.removeScroll?.();
  }
}
