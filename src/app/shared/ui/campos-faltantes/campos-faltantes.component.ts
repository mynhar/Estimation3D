import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender,
  computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormGroup, ValidationErrors } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CampoFormularioDirective, RegistroCampos } from './campo-formulario.directive';

/** Un requisito que no es un control del formulario (p. ej. un selector propio). */
export interface CampoExtra {
  /** Clave i18n de la etiqueta. Sin ella, se lee la del elemento `destino` (su label). */
  etiqueta?: string;
  /** id del elemento al que lleva el enlace. */
  destino?: string;
  /** Clave i18n del motivo cuando el campo no está vacío sino mal (p. ej. «mayor que 0»). */
  motivo?: string;
  params?: Record<string, unknown>;
}

interface Faltante {
  id:        string;
  etiqueta:  string;
  /** Clave i18n del motivo. */
  motivo:    string;
  params?:   Record<string, unknown>;
  requerido: boolean;
  el:        HTMLElement | null;
}

const ENFOCABLE_CAMPO = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const ENFOCABLE = `${ENFOCABLE_CAMPO}, button:not([disabled]), [tabindex]:not([tabindex="-1"])`;

let siguienteId = 0;

/**
 * Resumen de campos faltantes.
 *
 * Tras un intento de envío con el formulario incompleto, dice QUÉ campos
 * faltan (o están mal) por su nombre visible, y cada uno lleva al campo. La
 * lista se va vaciando mientras se rellenan; vacía, desaparece.
 *
 * Uso — en el componente del formulario:
 *   imports: [...CAMPOS_FALTANTES]
 *   intentos = signal(0);
 *   onSubmit() { if (form.invalid) { form.markAllAsTouched(); this.intentos.update(n => n + 1); return; } … }
 * y junto al botón de enviar:
 *   <app-campos-faltantes [formulario]="form" [intento]="intentos()" />
 *
 * La etiqueta se lee del DOM (label[for], aria-labelledby, label del bloque…),
 * así sale traducida y no hay que mantener una lista paralela. Un control sin
 * `formControlName` (casillas sueltas, un selector propio) se enlaza marcando
 * su bloque con `data-campo="<control>"`. `etiquetas` corrige los casos que el
 * DOM no resuelve.
 */
@Component({
    selector: 'app-campos-faltantes',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TranslatePipe],
    templateUrl: './campos-faltantes.component.html',
    styleUrl: './campos-faltantes.component.css'
})
export class CamposFaltantesComponent {
  /** Formulario(s) a revisar. Los formularios con `ngModel` sólo pasan `extra`. */
  formulario = input<AbstractControl | readonly AbstractControl[]>([]);
  /** Intentos de envío. 0: aún no se ha intentado y no se muestra nada. Cada aumento trae el resumen a la vista. */
  intento    = input(0);
  /**
   * Dónde buscar los controles que no pinta un `formControlName` (radios con
   * `name`, un bloque marcado con `data-campo="<control>"`). Por defecto, el
   * componente que contiene el resumen.
   */
  ambito     = input<HTMLElement | null | undefined>(null);
  /** Claves i18n de etiqueta por ruta del control (`calle`, `direccion.calle`). */
  etiquetas  = input<Readonly<Record<string, string>>>({});
  /** Requisitos fuera del formulario. Pasar sólo los que faltan. */
  extra      = input<readonly CampoExtra[]>([]);

  private host      = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private registro  = inject(RegistroCampos);
  private translate = inject(TranslateService);
  private injector  = inject(Injector);
  private panel     = viewChild<ElementRef<HTMLElement>>('panel');

  readonly tituloId = `cf-titulo-${++siguienteId}`;

  /** Sube con cada cambio de los formularios o del idioma: recalcula la lista. */
  private version = signal(0);

  private formularios = computed(() => {
    const f = this.formulario();
    return (Array.isArray(f) ? f : [f]) as readonly AbstractControl[];
  });

  faltantes = computed<Faltante[]>(() => {
    this.version();
    const etiquetas = this.etiquetas();
    const lista: Faltante[] = [];

    for (const raiz of this.formularios()) {
      for (const [ruta, control] of hojas(raiz)) {
        if (!control.invalid) continue;
        const el    = this.registro.elementoDe(control) ?? this.buscarEnDom(ruta);
        const clave = etiquetas[ruta] ?? etiquetas[ruta.split('.').pop()!];
        const etiqueta = clave
          ? this.translate.instant(clave)
          : (el && etiquetaDe(el)) || humanizar(ruta);
        lista.push({ id: `${lista.length}:${ruta}`, etiqueta, el, ...motivoDe(control.errors) });
      }
    }

    for (const x of this.extra()) {
      const el = x.destino ? document.getElementById(x.destino) : null;
      lista.push({
        id:        `extra:${x.etiqueta ?? x.destino}`,
        etiqueta:  x.etiqueta ? this.translate.instant(x.etiqueta) : (el && etiquetaDe(el)) || humanizar(x.destino ?? ''),
        motivo:    x.motivo ?? 'missing_fields.reason_required',
        params:    x.params,
        requerido: !x.motivo,
        el,
      });
    }

    return ordenarPorDom(lista);
  });

  /** Todos están vacíos (no mal escritos): el título dice «faltan», no «revisar». */
  todosRequeridos = computed(() => this.faltantes().every(f => f.requerido));

  titulo = computed(() => {
    const tipo = this.todosRequeridos() ? 'missing' : 'review';
    return `missing_fields.title_${tipo}_${this.faltantes().length === 1 ? 'one' : 'other'}`;
  });

  visible = computed(() => this.intento() > 0 && this.faltantes().length > 0);

  constructor() {
    // `events` cubre valor, estado y touched. La escritura va en `untracked`:
    // un `patchValue` dentro del effect de otro componente emite aquí mismo.
    effect(onCleanup => {
      const subs = this.formularios().map(f =>
        f.events.subscribe(() => untracked(() => this.version.update(v => v + 1))));
      onCleanup(() => subs.forEach(s => s.unsubscribe()));
    });

    this.translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.version.update(v => v + 1));

    // Cada intento fallido trae el resumen a la vista y le da el foco, también
    // el segundo y siguientes (el usuario pudo desplazarse lejos).
    effect(() => {
      if (!this.intento()) return;
      untracked(() => {
        this.version.update(v => v + 1); // el DOM ya puede tener etiquetas nuevas
        afterNextRender(() => this.enfocarResumen(), { injector: this.injector });
      });
    }, { allowSignalWrites: true });
  }

  irA(f: Faltante): void {
    const el = f.el;
    if (!el?.isConnected) return;
    const grupo   = el.closest<HTMLElement>('[role="radiogroup"], fieldset') ?? el;
    const destino = enfocable(el);
    destino?.focus({ preventScroll: true });
    grupo.scrollIntoView({ block: 'center', behavior: movimiento() });
  }

  private enfocarResumen(): void {
    const p = this.panel()?.nativeElement;
    // Oculto con display:none (p. ej. la copia del raíl en móvil): no hace nada.
    if (!p || !p.getClientRects().length) return;
    p.focus({ preventScroll: true });
    p.scrollIntoView({ block: 'nearest', behavior: movimiento() });
  }

  private alcance(): ParentNode {
    const a = this.ambito();
    if (a) return a;
    // El host del componente que contiene el resumen: el primer ancestro con
    // nombre de elemento personalizado.
    let n = this.host.parentElement;
    while (n && !n.tagName.includes('-')) n = n.parentElement;
    return n ?? document;
  }

  private buscarEnDom(ruta: string): HTMLElement | null {
    const nombre = CSS.escape(ruta.split('.').pop()!);
    return this.alcance().querySelector<HTMLElement>(
      `[formcontrolname="${nombre}"], [data-campo="${nombre}"], [name="${nombre}"], #${nombre}`);
  }
}

/** Para importar de una vez: el resumen y el registro de campos. */
export const CAMPOS_FALTANTES = [CamposFaltantesComponent, CampoFormularioDirective] as const;

/**
 * Para formularios con `ngModel`, donde lo que falta se calcula en un getter:
 * devuelve la MISMA lista mientras no cambie su contenido. Un array nuevo en
 * cada detección de cambios dispararía NG0100 en desarrollo.
 *
 *   private estable = listaEstable();
 *   get faltantes(): CampoExtra[] { return this.estable([...]); }
 */
export function listaEstable(): (lista: CampoExtra[]) => CampoExtra[] {
  let previa: CampoExtra[] = [];
  return lista => {
    const igual = lista.length === previa.length && lista.every((x, i) =>
      x.etiqueta === previa[i].etiqueta && x.destino === previa[i].destino && x.motivo === previa[i].motivo);
    if (!igual) previa = lista;
    return previa;
  };
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Controles hoja con su ruta (`a.b.0`), en orden de declaración. */
function* hojas(control: AbstractControl, ruta = ''): Generator<[string, AbstractControl]> {
  if (control instanceof FormGroup || control instanceof FormArray) {
    for (const [k, hijo] of Object.entries(control.controls)) {
      yield* hojas(hijo, ruta ? `${ruta}.${k}` : k);
    }
  } else {
    yield [ruta, control];
  }
}

function motivoDe(errors: ValidationErrors | null): Pick<Faltante, 'motivo' | 'params' | 'requerido'> {
  const e = errors ?? {};
  if (e['required'])  return { motivo: 'missing_fields.reason_required', requerido: true };
  if (e['email'])     return { motivo: 'missing_fields.reason_email', requerido: false };
  if (e['minlength']) return { motivo: 'missing_fields.reason_minlength', params: { n: e['minlength'].requiredLength }, requerido: false };
  if (e['maxlength']) return { motivo: 'missing_fields.reason_maxlength', params: { n: e['maxlength'].requiredLength }, requerido: false };
  if (e['pattern'])   return { motivo: 'missing_fields.reason_pattern', requerido: false };
  if (e['min'] || e['max']) return { motivo: 'missing_fields.reason_range', requerido: false };
  return { motivo: 'missing_fields.reason_invalid', requerido: false };
}

/** La etiqueta visible del campo, sin asterisco, «(opcional)» ni ayudas. */
function etiquetaDe(el: HTMLElement): string | null {
  const esOpcion = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');

  // Radios: la etiqueta de cada opción es la opción; manda la del grupo.
  if (esOpcion && (el as HTMLInputElement).type === 'radio') {
    const grupo = el.closest<HTMLElement>('[role="radiogroup"], fieldset');
    const t = grupo && (porAriaLabelledby(grupo) ?? grupo.getAttribute('aria-label')
      ?? texto(grupo.querySelector('legend')));
    if (t) return t;
  }

  // Un bloque de casillas: su leyenda.
  if (el instanceof HTMLFieldSetElement) {
    const t = texto(el.querySelector(':scope > legend'));
    if (t) return t;
  }

  return porAriaLabelledby(el)
    ?? (el.id ? texto(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) : null)
    ?? texto(el.closest('label'))
    ?? el.getAttribute('aria-label')
    ?? etiquetaDelBloque(el)
    ?? el.getAttribute('placeholder');
}

function porAriaLabelledby(el: HTMLElement): string | null {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return null;
  const t = ids.split(/\s+/).map(id => texto(document.getElementById(id))).filter(Boolean).join(' ');
  return t || null;
}

/**
 * Etiqueta hermana sin `for`: sube por los envoltorios del campo y toma la
 * primera `label` / `.form-label` anterior. Para en cuanto el envoltorio
 * contiene otro campo: ya sería la etiqueta de otro.
 */
function etiquetaDelBloque(el: HTMLElement): string | null {
  let n = el.parentElement;
  for (let nivel = 0; n && nivel < 4; nivel++, n = n.parentElement) {
    const campos = n.querySelectorAll('input:not([type="hidden"]), select, textarea, [formcontrolname]');
    const otros  = Array.from(campos).filter(c => c !== el && !el.contains(c) && !c.contains(el));
    if (otros.some(c => !(c instanceof HTMLInputElement && c.name && c.name === (el as HTMLInputElement).name))) {
      return null;
    }
    const lbl = Array.from(n.querySelectorAll<HTMLElement>('label, .form-label'))
      .find(l => !l.contains(el) && (l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    const t = texto(lbl ?? null);
    if (t) return t;
  }
  return null;
}

/** Texto legible de una etiqueta: quita lo decorativo y lo accesorio. */
function texto(nodo: Element | null): string | null {
  if (!nodo) return null;
  const copia = nodo.cloneNode(true) as Element;
  copia.querySelectorAll(
    '[aria-hidden="true"], small, .opt-label, .form-hint, .form-text, .field-hint, input, select, textarea',
  ).forEach(n => n.remove());
  // Angular quita los espacios entre elementos: «Título<span>FR</span>» se
  // leería «TítuloFR». Cada elemento queda separado de lo que le rodea.
  copia.querySelectorAll('*').forEach(n => { n.before(' '); n.after(' '); });
  let t = (copia.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/[\s*:]+$/, '');
  if (t.length > 80) t = `${t.slice(0, 77).trimEnd()}…`;
  return t || null;
}

function humanizar(ruta: string): string {
  const t = ruta.split('.').pop()!.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function enfocable(el: HTMLElement): HTMLElement | null {
  if (el.matches(ENFOCABLE)) return el;
  const dentro = el.querySelector<HTMLElement>(ENFOCABLE_CAMPO) ?? el.querySelector<HTMLElement>(ENFOCABLE);
  if (dentro) return dentro;
  const bloque = el.closest('section, fieldset, [role="group"], [role="radiogroup"]');
  return bloque?.querySelector<HTMLElement>(ENFOCABLE_CAMPO) ?? bloque?.querySelector<HTMLElement>(ENFOCABLE) ?? null;
}

/** En el orden en que se ven; lo que no tiene elemento, al final. */
function ordenarPorDom(lista: Faltante[]): Faltante[] {
  return lista
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      if (a.f.el && b.f.el && a.f.el !== b.f.el) {
        return a.f.el.compareDocumentPosition(b.f.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      if (a.f.el && !b.f.el) return -1;
      if (!a.f.el && b.f.el) return 1;
      return a.i - b.i;
    })
    .map(x => x.f);
}

function movimiento(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
