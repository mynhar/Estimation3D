import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy,
  ViewEncapsulation, afterNextRender, effect, inject, signal, viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Lang, LangService } from '../services/lang.service';
import { PointCloudDirective } from './directives/point-cloud.directive';
import { RevealDirective } from './directives/reveal.directive';
import { ScanSliderDirective } from './directives/scan-slider.directive';
import { SweepDirective } from './directives/sweep.directive';
import {
  COMPARE_ROWS, HERO_PINS, IMMERSION_WORDS, MEDIA, PLAN_PINS, PROBLEM_CELLS,
  PROBLEM_OPTIONS, PROPERTY_TYPES, SPECIALTIES, TICKER_KEYS,
} from './landing.data';

type LandingTheme = 'dark' | 'light';

/** Clave propia: el tema de la landing es independiente del resto de la app. */
const THEME_KEY = 'e3-landing-theme';

/** Secciones vigiladas por el scan-spy de la cabecera. */
const SPY_IDS = ['processus', 'services'] as const;

@Component({
  selector: 'app-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Encapsulación emulada (la de por defecto): Angular prefija cada selector, lo que
  // aísla los ~1000 selectores de la v4 de Bootstrap y del design system de la app.
  encapsulation: ViewEncapsulation.Emulated,
  imports: [
    RouterLink, TranslatePipe, ReactiveFormsModule,
    RevealDirective, SweepDirective, ScanSliderDirective, PointCloudDirective,
  ],
  templateUrl: './landing-page.component.html',
  styleUrls: [
    './styles/landing-base.css',
    './styles/landing-sections.css',
    './styles/landing-signature.css',
  ],
  host: {
    'class': 'e3-landing',
    '[attr.data-theme]': 'theme()',
  },
})
export class LandingPageComponent implements OnDestroy {
  private zone = inject(NgZone);
  private doc = inject(DOCUMENT);
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private fb = inject(FormBuilder);

  readonly lang = inject(LangService);
  readonly langs = this.lang.langs;
  readonly year = new Date().getFullYear();

  // ── Datos estructurales ───────────────────────────────────────────────────
  readonly specialties = SPECIALTIES;
  readonly problemCells = PROBLEM_CELLS;
  readonly compareRows = COMPARE_ROWS;
  readonly immersionWords = IMMERSION_WORDS;
  readonly heroPins = HERO_PINS;
  readonly planPins = PLAN_PINS;
  readonly tickerKeys = TICKER_KEYS;
  readonly problemOptions = PROBLEM_OPTIONS;
  readonly propertyTypes = PROPERTY_TYPES;
  readonly media = MEDIA;

  // ── Estado de interfaz ────────────────────────────────────────────────────
  readonly theme = signal<LandingTheme>('dark');
  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly activeSection = signal<string | null>(null);
  readonly sent = signal(false);

  // ── Referencias para escritura directa al DOM (sin detección de cambios) ──
  // `#orbitReadout`, `#heroSection` y `#orbitFrame` no aparecen aquí: la plantilla
  // se los pasa directamente a las directivas como variables de referencia.
  private progressBar = viewChild<ElementRef<HTMLElement>>('progressBar');
  private railReadout = viewChild<ElementRef<HTMLElement>>('railReadout');

  // ── Formulario "Créer mon dossier" ────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    nom: ['', Validators.required],
    telephone: ['', Validators.required],
    courriel: ['', [Validators.required, Validators.email]],
    typePropriete: ['', Validators.required],
    adresse: ['', Validators.required],
    problemes: this.fb.nonNullable.control<string[]>([]),
    description: [''],
  });

  /** Marca los campos con error sólo después del primer intento de envío. */
  readonly submitted = signal(false);

  private removeScroll?: () => void;

  constructor() {
    this.restoreTheme();

    // El tema se refleja como atributo del host y se persiste.
    effect(() => {
      const t = this.theme();
      try { localStorage.setItem(THEME_KEY, t); } catch { /* modo privado */ }
    });

    afterNextRender(() => this.zone.runOutsideAngular(() => this.bindScroll()));
  }

  private restoreTheme(): void {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') this.theme.set(saved);
    } catch { /* modo privado */ }
  }

  // ── Cabecera, barra de progreso, regla de medición y scan-spy ─────────────
  /**
   * Un único listener de scroll para los cuatro efectos. Corre fuera de la zona:
   * la barra de progreso y la lectura de la regla se escriben directamente en el
   * DOM, y sólo se vuelve a Angular cuando cambia un estado discreto.
   */
  private bindScroll(): void {
    const onScroll = () => {
      const root = this.doc.documentElement;
      const max = root.scrollHeight - window.innerHeight;
      const pct = max > 0 ? root.scrollTop / max : 0;

      const bar = this.progressBar()?.nativeElement;
      if (bar) bar.style.transform = `scaleX(${pct})`;

      const rail = this.railReadout()?.nativeElement;
      if (rail) {
        const y = Math.round(window.scrollY);
        const sections = this.host.querySelectorAll<HTMLElement>('main section');
        let idx = 1;
        sections.forEach((s, i) => {
          if (s.getBoundingClientRect().top < window.innerHeight * 0.5) idx = i + 1;
        });
        rail.textContent =
          'Y ' + String(y).padStart(4, '0') + ' · SECT ' + String(idx).padStart(2, '0');
      }

      const isScrolled = window.scrollY > 40;

      let current: string | null = null;
      const mid = window.innerHeight * 0.35;
      for (const id of SPY_IDS) {
        const el = this.host.querySelector<HTMLElement>('#' + id);
        if (el && el.getBoundingClientRect().top <= mid) current = id;
      }

      // Sólo se entra en la zona cuando algo discreto cambió.
      if (isScrolled !== this.scrolled() || current !== this.activeSection()) {
        this.zone.run(() => {
          this.scrolled.set(isScrolled);
          this.activeSection.set(current);
        });
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    this.removeScroll = () => window.removeEventListener('scroll', onScroll);
    onScroll();
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  setLang(l: Lang): void { this.lang.set(l); }

  setTheme(t: LandingTheme): void { this.theme.set(t); }

  toggleMenu(): void { this.menuOpen.update(v => !v); }

  closeMenu(): void { this.menuOpen.set(false); }

  /** Desplazamiento suave a una sección de la propia landing. */
  goTo(id: string, event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    const el = this.host.querySelector<HTMLElement>('#' + id);
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /** Alterna una casilla del bloque "type de problème". */
  toggleProblem(option: string, checked: boolean): void {
    const ctrl = this.form.controls.problemes;
    const list = ctrl.value;
    ctrl.setValue(checked ? [...list, option] : list.filter(v => v !== option));
  }

  hasProblem(option: string): boolean {
    return this.form.controls.problemes.value.includes(option);
  }

  /** true cuando hay que pintar el campo en rojo. */
  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const firstInvalid = this.host.querySelector<HTMLElement>('.field .is-invalid');
      firstInvalid?.focus();
      return;
    }

    // TODO(backend): todavía no existe tabla de prospectos en Supabase.
    // Cuando exista, enviar aquí this.form.getRawValue() y esperar la respuesta
    // antes de mostrar el estado de éxito.
    this.sent.set(true);
  }

  ngOnDestroy(): void {
    this.removeScroll?.();
  }
}
