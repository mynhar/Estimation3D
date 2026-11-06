import {
  ChangeDetectionStrategy, Component, ElementRef, Injector,
  afterNextRender, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';

let siguienteId = 0;

/** Qué hace el panel: archivar o deshacer el archivo. */
export type AccionArchivo = 'archivar' | 'desarchivar';

/** Claves i18n de cada acción (grupo `archivo`). */
const TEXTOS: Record<AccionArchivo, {
  btn: string; btnAria: string; titulo: string; desc: string; ok: string; enCurso: string;
}> = {
  archivar: {
    btn: 'archivo.btn', btnAria: 'archivo.btn_aria',
    titulo: 'archivo.confirm_title', desc: 'archivo.confirm_desc',
    ok: 'archivo.confirm_ok', enCurso: 'archivo.archivando',
  },
  desarchivar: {
    btn: 'archivo.btn_desarchivar', btnAria: 'archivo.btn_desarchivar_aria',
    titulo: 'archivo.desarchivar_title', desc: 'archivo.desarchivar_desc',
    ok: 'archivo.desarchivar_ok', enCurso: 'archivo.desarchivando',
  },
};

/**
 * Archivar o desarchivar un expediente: confirmación y llamada a
 * `archivar_expediente_admin` (expediente, ofertas y contratos → 'archivado';
 * obras → 'pausado') o a `desarchivar_expediente_admin` (cada uno vuelve a su
 * estado anterior).
 *
 * Archivar lo usan admin/file/edit, admin/to-estimate/edit, admin/offer/edit,
 * admin/contract/edit y el seguimiento de obra del admin. Desarchivar, solo
 * admin/file/edit (`[accion]`). Va en dos piezas porque el botón vive arriba a
 * la derecha, en la cabecera, y la confirmación debajo de ella, a todo el ancho:
 *
 *   <app-boton-archivar [control]="archivo" />            ← en la cabecera
 *   <app-archivar-expediente #archivo [expedienteId]="id"
 *                            [despues]="recargar" />      ← bajo la cabecera
 *
 * Este componente tiene el estado y pinta la confirmación; el botón solo lo
 * abre. El host no genera caja (`display: contents`), así que cerrado no ocupa
 * sitio ni suma un hueco más en contenedores con `gap`.
 */
@Component({
    selector: 'app-archivar-expediente',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TranslatePipe],
    templateUrl: './archivar-expediente.component.html',
    styleUrl: './archivar-expediente.component.css',
    host: { '[class.archivar--separado]': 'separado()' }
})
export class ArchivarExpedienteComponent {
  private expedienteService = inject(ExpedienteService);
  private injector          = inject(Injector);

  expedienteId = input.required<string>();
  /** Archivar (por defecto) o desarchivar. La pantalla lo deriva del estado. */
  accion       = input<AccionArchivo>('archivar');
  /** Margen bajo la confirmación. `false` si el contenedor ya separa con `gap`. */
  separado     = input(true);
  /**
   * Se espera tras archivar/desarchivar y antes de cerrar la confirmación: la
   * pantalla recarga lo que tiene en memoria (estado, ofertas, contratos).
   */
  despues      = input<(() => Promise<unknown>) | null>(null);
  /** El expediente quedó archivado. */
  archivado    = output<void>();
  /** El expediente volvió a su estado anterior. */
  desarchivado = output<void>();

  readonly panelId = `archivar-confirm-${++siguienteId}`;

  confirmando = signal(false);
  archivando  = signal(false);
  error       = signal<string | null>(null);

  /**
   * Acción fijada al abrir la confirmación. La recarga de `despues` cambia el
   * estado de la pantalla (y con él `accion`) antes de cerrarse: así el panel
   * no cambia de texto a mitad.
   */
  private enCurso = signal<AccionArchivo>('archivar');

  /** Textos del botón: siguen a `accion`. */
  textosBoton = computed(() => TEXTOS[this.accion()]);
  /** Textos del panel: los de la acción que se está confirmando. */
  textos      = computed(() => TEXTOS[this.enCurso()]);

  private botonNo = viewChild<ElementRef<HTMLButtonElement>>('botonNo');

  iniciar(): void {
    this.enCurso.set(this.accion());
    this.error.set(null);
    this.confirmando.set(true);
    // Foco en «Cancelar»: la opción segura de un diálogo de confirmación.
    afterNextRender(() => this.botonNo()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelar(): void {
    if (this.archivando()) return;
    this.confirmando.set(false);
    this.error.set(null);
  }

  async confirmar(): Promise<void> {
    if (this.archivando()) return;
    const accion = this.enCurso();
    this.archivando.set(true);
    this.error.set(null);
    try {
      if (accion === 'archivar') await this.expedienteService.archivarAdmin(this.expedienteId());
      else                       await this.expedienteService.desarchivarAdmin(this.expedienteId());
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.archivando.set(false);
      return;
    }
    // Ya está hecho: si la recarga falla, no se repite la llamada.
    try {
      await this.despues()?.();
    } catch (e: unknown) {
      console.error('[ArchivarExpediente] recarga:', e instanceof Error ? e.message : e);
    }
    this.archivando.set(false);
    this.confirmando.set(false);
    if (accion === 'archivar') this.archivado.emit();
    else                       this.desarchivado.emit();
  }
}
