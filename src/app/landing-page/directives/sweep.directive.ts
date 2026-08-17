import { Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * Activa la animación de barrido sólo mientras el elemento está en pantalla.
 * Reemplaza el bloque `[data-sweep]` de assets/site.js.
 */
@Directive({ selector: '[e3Sweep]', standalone: true })
export class SweepDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private zone = inject(NgZone);
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => {
        this.observer = new IntersectionObserver(
          entries => {
            for (const e of entries) e.target.classList.toggle('in-view', e.isIntersecting);
          },
          { threshold: 0.2 },
        );
        this.observer.observe(this.el);
      });
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
