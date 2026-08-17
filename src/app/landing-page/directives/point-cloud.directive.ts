import {
  Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input, numberAttribute,
} from '@angular/core';
import { CloudPoint, Rotation, SCAN_BAND, buildRoom, project, rotationOf } from '../point-cloud';

/**
 * Dibuja la nube de puntos escaneada sobre un `<canvas>`.
 * Reemplaza `makeViewer` de assets/v4.js.
 *
 * Dos modos:
 *  - no interactivo (hero): la nube sigue al puntero con parallax y oscila sola.
 *  - interactivo (visor orbital): arrastre con inercia y auto-órbita tras 1,4 s de inactividad.
 *
 * El bucle de animación corre íntegro fuera de la zona de Angular: a 60 fps
 * dispararía detección de cambios en cada frame.
 */
@Directive({ selector: 'canvas[e3PointCloud]', standalone: true })
export class PointCloudDirective implements OnDestroy {
  /** Multiplicador de densidad de puntos. */
  readonly density = input(1, { alias: 'e3PointCloud', transform: numberAttribute });
  /** Permite rotar la nube arrastrando. */
  readonly interactive = input(false);
  /** Centro de proyección como fracción del ancho / alto del canvas. */
  readonly centerXf = input(0.5, { transform: numberAttribute });
  readonly centerYf = input(0.5, { transform: numberAttribute });
  readonly rotY0 = input(-0.5, { transform: numberAttribute });
  readonly rotX0 = input(0.14, { transform: numberAttribute });
  /** Elemento en el que se escribe la lectura `AZ 000° · EL +00°`. */
  readonly readoutTarget = input<HTMLElement | undefined>(undefined);
  /** Elemento cuya visibilidad pausa el render (por defecto, el propio canvas). */
  readonly observeTarget = input<HTMLElement | undefined>(undefined);

  private canvas = inject(ElementRef<HTMLCanvasElement>).nativeElement as HTMLCanvasElement;
  private zone = inject(NgZone);

  private ctx!: CanvasRenderingContext2D;
  private points: CloudPoint[] = [];
  private reduce = false;

  // Geometría del lienzo
  private w = 0; private h = 0; private cx = 0; private cy = 0; private scale = 1;

  // Rotación: actual, objetivo y velocidad (inercia del arrastre)
  private rotY = 0; private rotX = 0;
  private tRotY = 0; private tRotX = 0;
  private velY = 0; private velX = 0;

  private dragging = false;
  private lastX = 0; private lastY = 0;
  private idle = 0;
  private pointerActive = false;
  private autoY = 0;

  // Plano de barrido que ilumina los puntos en dorado
  private scanZ = -1.4;
  private scanDir = 1;

  // Color de los puntos en canal RGB, leído de los tokens del tema. El canvas
  // no resuelve `var()`, así que se copian aquí y se releen al cambiar de tema.
  // Los valores iniciales son los del tema oscuro, por si el token no existe.
  private litRgb = '235,203,133';
  private dimRgb = '226,228,232';

  private t0 = 0;
  private raf = 0;
  private lastReadout = '';
  private cleanups: Array<() => void> = [];
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.init()));
  }

  private init(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.ctx = ctx;

    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.readThemeColors();
    this.watchTheme();
    this.points = buildRoom(this.density());
    this.rotY = this.tRotY = this.rotY0();
    this.rotX = this.tRotX = this.rotX0();

    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize, { passive: true });
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    if (this.interactive()) this.bindDrag();
    else this.bindParallax();

    // Pausar cuando la sección sale de pantalla.
    const host = this.observeTarget() ?? this.canvas;
    this.observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) this.start();
          else this.stop();
        }
      },
      { threshold: 0 },
    );
    this.observer.observe(host);

    this.start();
  }

  /** Copia `--cloud-*-rgb` del tema activo. Fuerza recálculo de estilo: solo se
   *  llama al iniciar y cuando cambia `data-theme`, nunca por frame. */
  private readThemeColors(): void {
    const cs = getComputedStyle(this.canvas);
    const lit = cs.getPropertyValue('--cloud-lit-rgb').trim();
    const dim = cs.getPropertyValue('--cloud-dim-rgb').trim();
    if (lit) this.litRgb = lit;
    if (dim) this.dimRgb = dim;
  }

  /** El conmutador de tema escribe `data-theme` en el host de la landing. */
  private watchTheme(): void {
    const themed = this.canvas.closest('[data-theme]');
    if (!themed) return;
    const obs = new MutationObserver(() => this.readThemeColors());
    obs.observe(themed, { attributes: true, attributeFilter: ['data-theme'] });
    this.cleanups.push(() => obs.disconnect());
  }

  private start(): void {
    if (this.raf) return;
    this.t0 = performance.now();
    this.raf = requestAnimationFrame(now => this.frame(now));
  }

  private stop(): void {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w * this.centerXf();
    this.cy = this.h * this.centerYf();
    this.scale = Math.min(this.w, this.h);
  }

  private bindDrag(): void {
    const down = (e: PointerEvent) => {
      this.dragging = true;
      this.idle = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
      this.canvas.closest('.orbit')?.classList.add('touched');
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.velY = dx * 0.006;
      this.velX = dy * 0.006;
      this.tRotY += this.velY;
      this.tRotX = Math.max(-1.1, Math.min(1.1, this.tRotX + this.velX));
      if (e.cancelable) e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      this.dragging = false;
      this.canvas.releasePointerCapture?.(e.pointerId);
      this.canvas.style.cursor = 'grab';
    };

    this.canvas.style.cursor = 'grab';
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointerdown', down);
      this.canvas.removeEventListener('pointermove', move);
      this.canvas.removeEventListener('pointerup', up);
      this.canvas.removeEventListener('pointercancel', up);
    });
  }

  private bindParallax(): void {
    const move = (e: PointerEvent) => {
      this.pointerActive = true;
      const mx = e.clientX / window.innerWidth - 0.5;
      const my = e.clientY / window.innerHeight - 0.5;
      this.tRotY = this.rotY0() + mx * 0.9;
      this.tRotX = this.rotX0() + my * 0.5;
    };
    window.addEventListener('pointermove', move, { passive: true });
    this.cleanups.push(() => window.removeEventListener('pointermove', move));
  }

  private frame(now: number): void {
    const dt = Math.min(33, now - this.t0);
    this.t0 = now;

    if (this.interactive()) {
      if (!this.dragging) {
        // Inercia, luego regreso lento a la órbita automática.
        this.tRotY += this.velY;
        this.tRotX += this.velX;
        this.velY *= 0.94;
        this.velX *= 0.94;
        this.idle += dt;
        if (this.idle > 1400 && !this.reduce) this.tRotY += 0.0016 * dt;
        this.tRotX += (this.rotX0() - this.tRotX) * 0.01;
      }
      this.rotY += (this.tRotY - this.rotY) * 0.12;
      this.rotX += (this.tRotX - this.rotX) * 0.12;
      this.emitReadout();
    } else {
      if (!this.reduce) this.autoY += dt * 0.00018;
      const drift = this.pointerActive ? 0 : Math.sin(this.autoY) * 0.35;
      const driftX = this.pointerActive ? 0 : Math.sin(this.autoY * 0.7) * 0.05;
      this.rotY += (this.tRotY + drift - this.rotY) * 0.06;
      this.rotX += (this.tRotX + driftX - this.rotX) * 0.06;
    }

    if (!this.reduce) {
      this.scanZ += this.scanDir * dt * 0.0009;
      if (this.scanZ > 1.4) { this.scanZ = 1.4; this.scanDir = -1; }
      if (this.scanZ < -1.4) { this.scanZ = -1.4; this.scanDir = 1; }
    }

    this.draw();
    this.raf = requestAnimationFrame(n => this.frame(n));
  }

  private draw(): void {
    const ctx = this.ctx;
    const rot: Rotation = rotationOf(this.rotY, this.rotX);
    const interactive = this.interactive();

    ctx.clearRect(0, 0, this.w, this.h);

    for (const p of this.points) {
      const q = project(p, rot, this.cx, this.cy, this.scale);
      if (!q) continue;
      if (q.sx < -20 || q.sx > this.w + 20 || q.sy < -20 || q.sy > this.h + 20) continue;

      // Cercanía al plano de barrido → el punto se enciende en dorado.
      const sd = Math.abs(p.z - this.scanZ);
      const lit = sd < SCAN_BAND ? 1 - sd / SCAN_BAND : 0;
      const df = Math.max(0.32, Math.min(1, 1.7 - q.depth * 0.42));
      const base = p.b * df;

      let rgb: string, a: number, size: number;
      if (lit > 0.02) {
        rgb = this.litRgb;
        a = Math.min(1, base * 0.75 + lit);
        size = (0.9 + lit * 1.9) * (q.f * 0.013 + 0.6);
      } else {
        rgb = this.dimRgb;
        a = base * (interactive ? 0.85 : 0.72);
        size = q.f * 0.014 + 0.55;
      }
      size = Math.max(0.6, Math.min(3.0, size));

      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, size, 0, 6.283);
      ctx.fill();

      // Halo en los puntos más iluminados por el barrido.
      if (lit > 0.6) {
        ctx.globalAlpha = lit * 0.18;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, size * 3.2, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Escribe `AZ 000° · EL +00°` directamente en el DOM, sin pasar por Angular. */
  private emitReadout(): void {
    const target = this.readoutTarget();
    if (!target) return;
    const az = (((this.rotY * 180) / Math.PI) % 360 + 360) % 360;
    const el = (this.rotX * 180) / Math.PI;
    const text =
      'AZ ' + String(Math.round(az)).padStart(3, '0') + '° · EL ' +
      (el >= 0 ? '+' : '−') + String(Math.abs(Math.round(el))).padStart(2, '0') + '°';
    if (text === this.lastReadout) return;
    this.lastReadout = text;
    target.textContent = text;
  }

  ngOnDestroy(): void {
    this.stop();
    this.observer?.disconnect();
    for (const fn of this.cleanups) fn();
  }
}
