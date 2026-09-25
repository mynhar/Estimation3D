import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { OfertaService } from '../../../services/oferta.service';
import { OfertaConConstructor } from '../../../models';

/** Acción de reparto pendiente de confirmar. */
export type AccionReparto = 'aceptar' | 'rechazar' | 'reactivar';

/**
 * Barra de reparto en bloque de «Ofertas recibidas».
 *
 * La usan `admin/offer/edit` y `admin/file/builder-bids`, que muestran la misma
 * lista con distinta envoltura. Aquí vive todo lo común —selección, acciones,
 * confirmación, errores—; el padre sólo pinta la casilla dentro de su propia
 * tarjeta y enlaza `[(seleccion)]`.
 *
 * Qué hace cada acción (los tres RPC son atómicos y quedan en `oferta_auditoria`):
 *   · aceptar   → las marcadas a 'aceptada' y TODAS las demás vivas a 'rechazada'
 *   · rechazar  → las marcadas a 'rechazada'; el resto no se toca
 *   · reactivar → las marcadas que estén 'rechazada' vuelven a 'pendiente'
 *
 * Ninguna genera contrato: eso sigue siendo del botón de adjudicar.
 */
@Component({
  selector: 'app-oferta-reparto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oferta-reparto.component.html',
  styleUrl: './oferta-reparto.component.css',
})
export class OfertaRepartoComponent {
  private ofertaService = inject(OfertaService);

  expedienteId = input.required<string>();
  /** Todas las ofertas del expediente, incluidas las dadas de baja. */
  ofertas = input.required<OfertaConConstructor[]>();
  /**
   * Estado del expediente. Con contrato vivo ('adjudicado' / 'contratado') el
   * reparto se bloquea, igual que en la base: reescribir el estado de las
   * ofertas dejaría el contrato descuadrado.
   */
  estadoExpediente = input<string>('');

  /** Ids marcados. Enlace bidireccional: el padre pinta las casillas. */
  seleccion = model<ReadonlySet<string>>(new Set());

  /** El reparto se aplicó: el padre debe recargar sus ofertas. */
  aplicado = output<void>();

  aplicando  = signal(false);
  error      = signal('');
  confirmando = signal<AccionReparto | null>(null);

  /** Una oferta dada de baja no participa en el reparto. */
  activas = computed(() => this.ofertas().filter(o => !o.eliminada_en));

  seleccionadas = computed(() =>
    this.activas().filter(o => this.seleccion().has(o.id)));

  /** Las que `aceptar` mandaría a 'rechazada'. */
  noSeleccionadas = computed(() =>
    this.activas().filter(o => !this.seleccion().has(o.id)));

  seleccionadasRechazadas = computed(() =>
    this.seleccionadas().filter(o => o.estado === 'rechazada'));

  todasSeleccionadas = computed(() => {
    const activas = this.activas();
    return activas.length > 0 && activas.every(o => this.seleccion().has(o.id));
  });

  bloqueado = computed(() => {
    const e = this.estadoExpediente();
    return e === 'adjudicado' || e === 'contratado';
  });

  alternarTodas(): void {
    this.reiniciar();
    this.seleccion.set(
      this.todasSeleccionadas()
        ? new Set()
        : new Set(this.activas().map(o => o.id)),
    );
  }

  limpiar(): void {
    this.reiniciar();
    this.seleccion.set(new Set());
  }

  private reiniciar(): void {
    this.error.set('');
    this.confirmando.set(null);
  }

  async aplicar(): Promise<void> {
    const accion = this.confirmando();
    if (!accion || this.aplicando()) return;

    const ids = accion === 'reactivar'
      ? this.seleccionadasRechazadas().map(o => o.id)
      : this.seleccionadas().map(o => o.id);
    if (!ids.length) return;

    this.aplicando.set(true);
    this.error.set('');
    try {
      const id = this.expedienteId();
      if (accion === 'aceptar')       await this.ofertaService.aceptarSeleccion(id, ids);
      else if (accion === 'rechazar') await this.ofertaService.rechazarSeleccion(id, ids);
      else                            await this.ofertaService.reactivarSeleccion(id, ids);

      this.seleccion.set(new Set());
      this.confirmando.set(null);
      this.aplicado.emit();
    } catch (e: any) {
      this.error.set(e.message);
      this.confirmando.set(null);
    } finally {
      this.aplicando.set(false);
    }
  }
}

/**
 * Alterna un id dentro de un conjunto inmutable. La comparten los padres para
 * la casilla de cada tarjeta, que es lo único de la selección que vive fuera
 * de este componente.
 */
export function alternarEnSeleccion(
  actual: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const copia = new Set(actual);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  return copia;
}
