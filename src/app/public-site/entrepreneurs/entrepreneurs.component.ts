import {
  AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import {
  ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation, computed, inject, signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { RevealDirective } from '../../landing-page/directives/reveal.directive';
import { SweepDirective } from '../../landing-page/directives/sweep.directive';
import { SERVICIOS_FALLBACK, Servicio } from '../../models';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { EdgeErrorService } from '../../services/edge-error.service';
import { SolicitudConstructorService } from '../../services/solicitud-constructor.service';
import { SitePageBase } from '../site-page.base';
import {
  BENEFITS, FAQ_IDS, PROBLEM_CELLS, REQUIREMENTS, SPECIALTY_SLOTS, STEPS,
} from './entrepreneurs.data';

/** Licencia RBQ de Quebec: diez dígitos en tres bloques, «0000-0000-00». */
const RBQ_RE = /^\d{4}-\d{4}-\d{2}$/;

/**
 * La especialidad se puede declarar de dos maneras y una sola basta: marcando
 * «todos los servicios», o eligiendo al menos uno de la lista. El validador vive
 * en el control de la lista —y no en el grupo— para que el `invalid()` de la
 * plantilla siga funcionando campo a campo.
 */
function especialidadRequerida(ctrl: AbstractControl): ValidationErrors | null {
  const todas = ctrl.parent?.get('toutes')?.value === true;
  const lista = (ctrl.value ?? []) as number[];
  return todas || lista.length > 0 ? null : { required: true };
}

/**
 * Entrepreneurs — página pública (sin guard). Puerto de
 * `Estimation3D - Entrepreneurs.html`.
 *
 * Dos cambios respecto al original, ambos por la misma razón — no medir el DOM
 * desde TypeScript:
 *  · el acordeón de FAQ guarda el id abierto en una signal, y el CSS anima con
 *    `grid-template-rows: 0fr → 1fr` en vez de escribir `maxHeight = scrollHeight`;
 *  · el formulario es reactivo y valida en el cliente antes de enviar.
 */
@Component({
  selector: 'app-entrepreneurs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  imports: [RouterLink, TranslatePipe, ReactiveFormsModule, RevealDirective, SweepDirective],
  templateUrl: './entrepreneurs.component.html',
  styleUrls: ['../styles/site-chrome.css', './entrepreneurs.component.css'],
  host: {
    'class': 'e3-public-page',
    '[attr.data-theme]': 'theme()',
  },
})
export class EntrepreneursComponent extends SitePageBase implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthSupabaseService);
  private candidaturas = inject(SolicitudConstructorService);
  private edgeErrors = inject(EdgeErrorService);

  readonly year = new Date().getFullYear();

  readonly problemCells = PROBLEM_CELLS;
  readonly steps = STEPS;
  readonly benefits = BENEFITS;
  readonly requirements = REQUIREMENTS;
  readonly specialtySlots = SPECIALTY_SLOTS;
  readonly faqIds = FAQ_IDS;

  /** Id de la pregunta abierta; `null` cuando todas están cerradas. */
  readonly openFaq = signal<string | null>(null);

  // Las casillas de especialidad ya no salen de una constante local: lo que el
  // candidato puede declarar tiene que ser exactamente lo que la aplicación
  // sabe estimar, así que la lista es la tabla `servicio`.
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

  readonly form = this.fb.nonNullable.group({
    entreprise: ['', Validators.required],
    // La persona de contacto va separada en nombre y apellido: es como se
    // guarda en `perfil`, y evita tener que partir una cadena libre después.
    prenom: ['', Validators.required],
    nom: ['', Validators.required],
    telephone: ['', Validators.required],
    courriel: ['', [Validators.required, Validators.email]],
    rbq: ['', [Validators.required, Validators.pattern(RBQ_RE)]],
    // «Todos los servicios» es una respuesta por derecho propio, no la ausencia
    // de respuesta: viaja en su propio campo y no como una lista vacía.
    toutes: [false],
    specialites: this.fb.nonNullable.control<number[]>([], especialidadRequerida),
    annees: this.fb.nonNullable.control<number | null>(
      null, [Validators.required, Validators.min(0), Validators.max(80)],
    ),
    zone: ['', Validators.required],
    message: [''],
  });

  /** Marca los campos con error sólo después del primer intento de envío. */
  readonly submitted = signal(false);
  readonly sent = signal(false);
  readonly sending = signal(false);
  /** Clave de i18n del último fallo de envío; `null` cuando no hay ninguno. */
  readonly errorKey = signal<string | null>(null);

  /** Con «todos los servicios» marcado, las casillas sueltas no aplican. */
  readonly todosLosServicios = toSignal(this.form.controls.toutes.valueChanges, {
    initialValue: this.form.controls.toutes.value,
  });

  ngOnInit(): void {
    void this.cargarServicios();
  }

  /**
   * La tabla `servicio` es de lectura abierta, así que la página puede
   * consultarla sin sesión; si la consulta falla o vuelve vacía se cae al
   * catálogo local para no dejar el bloque mudo.
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

  toggleFaq(id: string): void {
    this.openFaq.update(cur => (cur === id ? null : id));
  }

  /**
   * Va dando forma «0000-0000-00» mientras se escribe: se queda con los dígitos
   * y coloca los guiones, de modo que el campo no pueda salir con un formato
   * que la aplicación rechazaría después.
   */
  formatRbq(event: Event): void {
    const input = event.target as HTMLInputElement;
    const d = input.value.replace(/\D/g, '').slice(0, 10);
    const valor = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 10)].filter(p => p !== '').join('-');
    input.value = valor;
    this.form.controls.rbq.setValue(valor);
  }

  /** «Todos los servicios» y las casillas sueltas son excluyentes. */
  toggleAllSpecialties(checked: boolean): void {
    this.form.controls.toutes.setValue(checked);
    if (checked) this.form.controls.specialites.setValue([]);
    this.form.controls.specialites.updateValueAndValidity();
    this.form.controls.specialites.markAsTouched();
  }

  toggleSpecialty(id: number, checked: boolean): void {
    const ctrl = this.form.controls.specialites;
    const list = ctrl.value;
    ctrl.setValue(checked ? [...list, id] : list.filter(v => v !== id));
    ctrl.markAsTouched();
  }

  hasSpecialty(id: number): boolean {
    return this.form.controls.specialites.value.includes(id);
  }

  /** true cuando hay que pintar el campo en rojo. */
  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  /**
   * Manda la candidatura a `crear-constructor-landing`, que da de alta al
   * constructor (o refresca su ficha si ya lo era) y escribe los dos correos.
   * El estado de éxito no se pinta hasta que la función responde: decir
   * «recibida» antes de tiempo sería mentir si el alta falla.
   */
  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.host.querySelector<HTMLElement>('.field .is-invalid')?.focus();
      return;
    }
    if (this.sending()) return;

    this.sending.set(true);
    this.errorKey.set(null);
    const v = this.form.getRawValue();

    try {
      await this.candidaturas.crear({
        entreprise:  v.entreprise,
        prenom:      v.prenom,
        nom:         v.nom,
        telephone:   v.telephone,
        courriel:    v.courriel,
        rbq:         v.rbq,
        // `toutes` es lo que distingue «cubre todo» de «no lo dijo»: viaja
        // aparte, y con él marcado la lista va vacía a propósito.
        toutes:      v.toutes,
        specialites: v.toutes ? [] : v.specialites,
        annees:      v.annees ?? 0,
        zone:        v.zone,
        message:     v.message,
        idioma:      this.lang.current(),
      });
      this.sent.set(true);
    } catch (e) {
      this.errorKey.set(this.edgeErrors.clave(e, 'edge_errors.error_interno'));
    } finally {
      this.sending.set(false);
    }
  }
}
