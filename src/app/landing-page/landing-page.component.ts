import {
  ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, OnInit,
  ViewEncapsulation, afterNextRender, computed, inject, signal, viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { PROVINCIAS_CANADA, SERVICIOS_FALLBACK, Servicio } from '../models';
import { SiteTheme, SiteThemeService } from '../public-site/site-theme.service';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { EdgeErrorService } from '../services/edge-error.service';
import { Lang, LangService } from '../services/lang.service';
import { SolicitudLandingService } from '../services/solicitud-landing.service';
import { RevealDirective } from './directives/reveal.directive';
import { ScanSliderDirective } from './directives/scan-slider.directive';
import { SweepDirective } from './directives/sweep.directive';
import {
  COMPARE_ROWS, HERO_PINS, IMMERSION_WORDS, MEDIA, PLAN_PINS, PROBLEM_CELLS,
  PROPERTY_TYPES, SPECIALTIES, TICKER_KEYS,
} from './landing.data';

/** Código postal canadiense: A1A 1A1 (con espacio, guion o nada). */
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

@Component({
  selector: 'app-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Encapsulación emulada (la de por defecto): Angular prefija cada selector, lo que
  // aísla los ~1000 selectores de la landing de Bootstrap y del design system de la app.
  encapsulation: ViewEncapsulation.Emulated,
  imports: [
    RouterLink, TranslatePipe, ReactiveFormsModule,
    RevealDirective, SweepDirective, ScanSliderDirective,
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
export class LandingPageComponent implements OnInit, OnDestroy {
  private zone = inject(NgZone);
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private fb = inject(FormBuilder);
  private auth = inject(AuthSupabaseService);
  private solicitudes = inject(SolicitudLandingService);
  private edgeErrors = inject(EdgeErrorService);

  readonly lang = inject(LangService);
  readonly langs = this.lang.langs;
  readonly year = new Date().getFullYear();

  // El tema vive en un servicio compartido con Le Journal y Entrepreneurs: así
  // el conmutador se recuerda al navegar entre las tres páginas públicas.
  private themeSvc = inject(SiteThemeService);
  readonly theme = this.themeSvc.theme;

  // ── Datos estructurales ───────────────────────────────────────────────────
  readonly specialties = SPECIALTIES;
  readonly problemCells = PROBLEM_CELLS;
  readonly compareRows = COMPARE_ROWS;
  readonly immersionWords = IMMERSION_WORDS;
  readonly heroPins = HERO_PINS;
  readonly planPins = PLAN_PINS;
  readonly tickerKeys = TICKER_KEYS;
  readonly propertyTypes = PROPERTY_TYPES;
  readonly provincesCanada = PROVINCIAS_CANADA;
  readonly media = MEDIA;

  // ── Estado de interfaz ────────────────────────────────────────────────────
  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly sent = signal(false);
  readonly sending = signal(false);
  /** Clave i18n del último fallo del envío; vacía mientras no haya error. */
  readonly sendError = signal('');

  // ── Servicios activos (bloque "type de problème") ─────────────────────────
  // La lista sale de la tabla `servicio`, no de una constante: lo que la landing
  // ofrece tiene que ser exactamente lo que la aplicación sabe estimar.
  private serviciosRaw = signal<Servicio[]>([]);
  readonly loadingServices = signal(true);

  /** Servicios activos con el nombre ya resuelto al idioma en curso. */
  readonly services = computed(() => {
    const l = this.lang.current();
    return this.serviciosRaw().map(s => ({
      id: s.id,
      nombre:
        l === 'en' ? (s.nombre_en || s.nombre_fr || s.nombre_es)
      : l === 'es' ? (s.nombre_es || s.nombre_fr)
      :              (s.nombre_fr || s.nombre_es),
    }));
  });

  // ── Referencias para escritura directa al DOM (sin detección de cambios) ──
  private railReadout = viewChild<ElementRef<HTMLElement>>('railReadout');

  // ── Formulario "Créer mon dossier" ────────────────────────────────────────
  readonly form = this.fb.nonNullable.group({
    prenom: ['', Validators.required],
    nom: ['', Validators.required],
    telephone: ['', Validators.required],
    courriel: ['', [Validators.required, Validators.email]],
    typePropriete: ['', Validators.required],
    // Dirección canadiense, mismo desglose que "Localisation" de client/file/create.
    // Sólo el número de unidad es opcional: no todas las propiedades tienen uno.
    adresse: this.fb.nonNullable.group({
      numero_unidad: [''],
      calle: ['', Validators.required],
      ciudad: ['', Validators.required],
      provincia_ca: ['QC', Validators.required],
      codigo_postal: ['', [Validators.required, Validators.pattern(CA_POSTAL_RE)]],
    }),
    // Un solo servicio por dossier, igual que en client/file/create.
    servicioId: this.fb.control<number | null>(null, Validators.required),
    description: [''],
  });

  /** Marca los campos con error sólo después del primer intento de envío. */
  readonly submitted = signal(false);

  private removeScroll?: () => void;

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.bindScroll()));
  }

  ngOnInit(): void {
    void this.cargarServicios();
  }

  /**
   * Servicios activos ordenados por código. La tabla `servicio` es de lectura
   * abierta, así que la landing puede consultarla sin sesión; si la consulta
   * falla o vuelve vacía se cae al catálogo local para no dejar el bloque mudo.
   */
  private async cargarServicios(): Promise<void> {
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es')
      .eq('activo', true)
      .order('codigo');

    if (error) console.error('servicio table error:', error.message);
    this.serviciosRaw.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.loadingServices.set(false);
  }

  // ── Cabecera, barra de progreso, regla de medición y scan-spy ─────────────
  /**
   * Un único listener de scroll. Corre fuera de la zona: la lectura de la regla se
   * escribe directamente en el DOM, y sólo se vuelve a Angular cuando cambia el
   * estado discreto de la cabecera.
   */
  private bindScroll(): void {
    const onScroll = () => {
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

      // Sólo se entra en la zona cuando algo discreto cambió.
      if (isScrolled !== this.scrolled()) {
        this.zone.run(() => this.scrolled.set(isScrolled));
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    this.removeScroll = () => window.removeEventListener('scroll', onScroll);
    onScroll();
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  setLang(l: Lang): void { this.lang.set(l); }

  setTheme(t: SiteTheme): void { this.themeSvc.set(t); }

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

  /**
   * Vuelve al principio de la landing. Hace falta además del `routerLink="/"`:
   * al estar ya en `/` el router ignora la navegación y el scroll no se movería.
   */
  goTop(event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  /** Igual que `invalid()` pero para los campos del subgrupo de dirección. */
  invalidAddr(name: keyof typeof this.form.controls.adresse.controls): boolean {
    const c = this.form.controls.adresse.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  /** true cuando hay que pintar el campo en rojo. */
  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  /**
   * Manda la solicitud a `crear-dossier-landing`: esa función da de alta al
   * cliente (o actualiza sus datos si el correo ya existe), abre el expediente
   * y escribe al cliente y al buzón interno. Aquí sólo se transporta el
   * formulario y se refleja el resultado.
   */
  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // El grupo de radios no lleva `.is-invalid` (la marca va en el contenedor),
      // así que se busca también su primer botón para poder enfocarlo.
      const firstInvalid = this.host.querySelector<HTMLElement>('.field .is-invalid, .checks--err input');
      firstInvalid?.focus();
      return;
    }
    if (this.sending()) return;

    this.sending.set(true);
    this.sendError.set('');

    const v = this.form.getRawValue();
    try {
      await this.solicitudes.crear({
        prenom:        v.prenom,
        nom:           v.nom,
        telephone:     v.telephone,
        courriel:      v.courriel,
        typePropriete: v.typePropriete,
        servicioId:    v.servicioId!,
        adresse:       v.adresse,
        description:   v.description ?? '',
        idioma:        this.lang.current(),
      });
      this.sent.set(true);
    } catch (e) {
      console.error('[landing] crear-dossier-landing:', e);
      this.sendError.set(this.edgeErrors.clave(e, 'landing.form.send_error'));
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy(): void {
    this.removeScroll?.();
  }
}
