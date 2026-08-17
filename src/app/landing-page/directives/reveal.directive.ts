import { Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';

/**
 * Revela el elemento al entrar en el viewport (añade la clase `in`).
 * Reemplaza el bloque "reveal on scroll" de assets/site.js.
 *
 * Comparte un único IntersectionObserver entre todas las instancias, en vez de
 * crear uno por elemento como hacía el script original.
 */
@Directive({
  selector: '[e3Reveal]',
  standalone: true,
  host: { '[class.rv]': 'true', '[class.rv-d1]': 'delay() === 1', '[class.rv-d2]': 'delay() === 2', '[class.rv-d3]': 'delay() === 3' },
})
export class RevealDirective implements OnDestroy {
  /** Escalón de retardo en cascada: 0 (inmediato) a 3. */
  readonly delay = input(0, { alias: 'e3Reveal', transform: (v: string | number) => Number(v) || 0 });

  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private zone = inject(NgZone);

  /** Observer compartido por todas las instancias de la directiva. */
  private static observer: IntersectionObserver | null = null;
  private static refCount = 0;
  /** Red de seguridad: nada queda oculto pase lo que pase. */
  private static safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private static pending = new Set<HTMLElement>();

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.observe()));
  }

  private observe(): void {
    RevealDirective.pending.add(this.el);

    if (!RevealDirective.observer) {
      RevealDirective.observer = new IntersectionObserver(
        entries => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add('in');
            RevealDirective.pending.delete(e.target as HTMLElement);
            RevealDirective.observer?.unobserve(e.target);
          }
        },
        { threshold: 0.16 },
      );
    }
    RevealDirective.refCount++;
    RevealDirective.observer.observe(this.el);

    // Lo que ya está en pantalla al cargar se revela sin esperar al observer
    // (IntersectionObserver puede llegar tarde o quedar frenado en pestañas de fondo).
    if (this.el.getBoundingClientRect().top < window.innerHeight * 0.96) {
      this.el.classList.add('in');
    }

    // Seguridad: a los 1.8 s se revela todo lo que siga pendiente.
    RevealDirective.safetyTimer ??= setTimeout(() => {
      for (const el of RevealDirective.pending) el.classList.add('in');
      RevealDirective.pending.clear();
      RevealDirective.safetyTimer = null;
    }, 1800);
  }

  ngOnDestroy(): void {
    RevealDirective.pending.delete(this.el);
    if (!RevealDirective.observer) return;

    RevealDirective.observer.unobserve(this.el);
    if (--RevealDirective.refCount <= 0) {
      RevealDirective.observer.disconnect();
      RevealDirective.observer = null;
      RevealDirective.refCount = 0;
      if (RevealDirective.safetyTimer) {
        clearTimeout(RevealDirective.safetyTimer);
        RevealDirective.safetyTimer = null;
      }
      RevealDirective.pending.clear();
    }
  }
}
