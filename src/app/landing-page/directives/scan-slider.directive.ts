import { Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject } from '@angular/core';

const MIN = 0.04;
const MAX = 0.96;

/**
 * Cortina arrastrable "relevé brut ↔ dossier 3D": escribe la posición en la
 * custom property `--rev`, que el CSS usa como clip.
 *
 * Reemplaza el bloque `#revealScan` de assets/site.js. Cambios respecto al original:
 * eventos de puntero unificados (en vez de mouse + touch duplicados), auto-demo con
 * requestAnimationFrame (en vez de setInterval a 40 ms) y control por teclado.
 */
@Directive({
  selector: '[e3ScanSlider]',
  standalone: true,
  host: {
    'role': 'slider',
    'tabindex': '0',
    'aria-valuemin': '4',
    'aria-valuemax': '96',
    '[attr.aria-valuenow]': 'ariaNow',
    '(keydown)': 'onKey($event)',
  },
})
export class ScanSliderDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private zone = inject(NgZone);

  protected ariaNow = 52;

  private dragging = false;
  private touched = false;
  private raf = 0;
  private demoT = 0;
  private cleanups: Array<() => void> = [];

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.init()));
  }

  private init(): void {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onDown = (e: PointerEvent) => {
      this.dragging = true;
      this.markTouched();
      this.el.setPointerCapture?.(e.pointerId);
      this.setFromClientX(e.clientX);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (this.dragging) this.setFromClientX(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      this.dragging = false;
      this.el.releasePointerCapture?.(e.pointerId);
    };

    this.el.addEventListener('pointerdown', onDown);
    this.el.addEventListener('pointermove', onMove);
    this.el.addEventListener('pointerup', onUp);
    this.el.addEventListener('pointercancel', onUp);
    this.cleanups.push(() => {
      this.el.removeEventListener('pointerdown', onDown);
      this.el.removeEventListener('pointermove', onMove);
      this.el.removeEventListener('pointerup', onUp);
      this.el.removeEventListener('pointercancel', onUp);
    });

    // Demo automática suave hasta la primera interacción del usuario.
    if (reduce) {
      this.setRatio(0.52);
      return;
    }
    const tick = () => {
      if (this.touched) { this.raf = 0; return; }
      this.demoT += 0.04;
      this.setRatio((52 + Math.sin(this.demoT) * 30) / 100);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private markTouched(): void {
    if (this.touched) return;
    this.touched = true;
    this.el.classList.add('touched');
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  private setFromClientX(clientX: number): void {
    const r = this.el.getBoundingClientRect();
    this.setRatio((clientX - r.left) / r.width);
  }

  private setRatio(ratio: number): void {
    const p = Math.max(MIN, Math.min(MAX, ratio));
    const pct = p * 100;
    this.el.style.setProperty('--rev', pct.toFixed(1) + '%');
    this.ariaNow = Math.round(pct);
    this.el.setAttribute('aria-valuenow', String(this.ariaNow));
  }

  protected onKey(e: KeyboardEvent): void {
    const step = e.shiftKey ? 0.1 : 0.02;
    let delta = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'Home') delta = -1;
    else if (e.key === 'End') delta = 1;
    else return;

    this.markTouched();
    this.setRatio(this.ariaNow / 100 + delta);
    e.preventDefault();
  }

  ngOnDestroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
  }
}
