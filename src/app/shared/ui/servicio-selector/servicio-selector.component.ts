import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Un tipo de servicio ya traducido al idioma activo. */
export interface ServicioOpcion {
  id:          number;
  codigo:      string;
  nombre:      string;
  descripcion: string;
  /** Dado de baja en el catálogo. Solo se lista si el expediente ya lo tenía. */
  inactivo?:   boolean;
}

/**
 * Texto de una selección para los resúmenes laterales: los nombres en orden de
 * prioridad, o la etiqueta de «todos» cuando están todos marcados (y hay más
 * de uno; con uno solo, su nombre dice más).
 */
export function resumirServicios(
  ids:           number[],
  opciones:      ServicioOpcion[],
  etiquetaTodos: (total: number) => string,
): string | null {
  if (!ids.length) return null;
  const marcados = new Set(ids);
  if (opciones.length > 1 && opciones.every(o => marcados.has(o.id))) {
    return etiquetaTodos(opciones.length);
  }
  const porId = new Map(opciones.map(o => [o.id, o.nombre]));
  return ids.map(id => porId.get(id)).filter(Boolean).join(', ') || null;
}

let secuencia = 0;

/**
 * Selección de los tipos de servicio de un expediente: uno, varios o todos,
 * con al menos uno obligatorio.
 *
 * La usan las altas y ediciones de expediente de administrador, estimador y
 * cliente (`admin|estimator|client` + `/file/create` o `/file/edit`). El
 * padre carga y traduce el catálogo, enlaza `[(seleccion)]` y decide cuándo
 * forzar la validación
 * (`validar`, al intentar guardar). Aquí vive todo lo común: casillas, «todos»,
 * contador, marca del principal y mensaje de error.
 *
 * `seleccion` está en orden de prioridad: el primero es el servicio principal
 * (`expediente.servicio_id`), el que leen estimación, seguimiento y listados.
 */
@Component({
  selector: 'app-servicio-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './servicio-selector.component.html',
  styleUrl: './servicio-selector.component.css',
  host: { '[class.srv-compacto]': 'compacto()' },
})
export class ServicioSelectorComponent {
  opciones    = input.required<ServicioOpcion[]>();
  /** Ids marcados, en orden de prioridad. Enlace bidireccional. */
  seleccion   = model<number[]>([]);
  /** El padre intentó guardar: valida aunque el usuario no haya tocado nada. */
  validar     = input(false);
  disabled    = input(false);
  /** Id del elemento que rotula el grupo (título de sección o etiqueta). */
  labelledBy  = input<string | null>(null);
  /** Id de la ayuda del padre, si la hay. */
  describedBy = input<string | null>(null);
  /**
   * Señala el primero como «Principal». En un expediente sí (es
   * `expediente.servicio_id`); en una oferta no: su precio es uno para todos.
   */
  mostrarPrincipal = input(true);
  /** Sin descripciones y tarjetas más bajas, para columnas estrechas. */
  compacto    = input(false);

  readonly errorId = `srv-error-${++secuencia}`;

  /** El usuario ya marcó o desmarcó algo: a partir de aquí se valida en vivo. */
  private tocado = signal(false);

  private marcados = computed(() => new Set(this.seleccion()));

  principal = computed(() => this.seleccion()[0] ?? null);
  /** El principal solo se señala cuando hay más de uno: con uno es obvio. */
  hayVarios = computed(() => this.mostrarPrincipal() && this.seleccion().length > 1);

  totalMarcados = computed(() =>
    this.opciones().filter(o => this.marcados().has(o.id)).length
  );

  todos = computed(() =>
    this.opciones().length > 0 && this.totalMarcados() === this.opciones().length
  );

  error = computed(() =>
    (this.tocado() || this.validar()) && this.seleccion().length === 0
  );

  descripcion = computed(() =>
    [this.describedBy(), this.error() ? this.errorId : null].filter(Boolean).join(' ') || null
  );

  marcado(id: number): boolean {
    return this.marcados().has(id);
  }

  alternar(id: number): void {
    this.tocado.set(true);
    this.seleccion.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }

  /** Marca los que faltan (sin alterar el principal) o desmarca todos. */
  alternarTodos(): void {
    this.tocado.set(true);
    if (this.todos()) {
      this.seleccion.set([]);
      return;
    }
    this.seleccion.update(ids => {
      const ya = new Set(ids);
      return [...ids, ...this.opciones().map(o => o.id).filter(id => !ya.has(id))];
    });
  }

  icono(codigo: string): string {
    const c = codigo.toLowerCase();
    if (c.includes('moho'))                          return 'bi-biohazard';
    if (c.includes('agua') || c.includes('dano'))    return 'bi-droplet';
    if (c.includes('desamian'))                      return 'bi-layers';
    if (c.includes('demolic'))                       return 'bi-buildings';
    if (c.includes('aisla'))                         return 'bi-layers';
    if (c.includes('fund') || c.includes('dren'))    return 'bi-water';
    if (c.includes('elect'))                         return 'bi-lightning-charge';
    if (c.includes('pint'))                          return 'bi-brush';
    if (c.includes('techo') || c.includes('teja'))   return 'bi-house';
    if (c.includes('piso')  || c.includes('cer'))    return 'bi-grid-3x3';
    if (c.includes('carpint') || c.includes('mad'))  return 'bi-hammer';
    if (c.includes('alumin') || c.includes('vidri')) return 'bi-window';
    if (c.includes('jardin') || c.includes('plant')) return 'bi-tree';
    return 'bi-tools';
  }
}
