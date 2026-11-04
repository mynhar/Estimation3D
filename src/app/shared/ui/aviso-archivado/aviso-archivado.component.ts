import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Desde qué pantalla se avisa. Cambia el título y el texto:
 *   · expediente → cliente o constructor viendo el expediente
 *   · oferta     → constructor viendo su oferta
 *   · contrato   → cliente o constructor viendo el contrato
 *   · obra       → seguimiento de obra (pausada por el archivo)
 *   · admin      → administrador en admin/file/edit
 */
export type AmbitoArchivado = 'expediente' | 'oferta' | 'contrato' | 'obra' | 'admin';

/**
 * Aviso de expediente archivado.
 *
 * Lo pinta cada pantalla cuando el expediente, la oferta o el contrato están en
 * 'archivado' (lo pone `archivar_expediente_admin`). Dice a quien lo vea que
 * los trabajos no se realizarán. `compacto` es la versión de una línea para
 * tarjetas de listas.
 */
@Component({
  selector: 'app-aviso-archivado',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe],
  templateUrl: './aviso-archivado.component.html',
  styleUrl: './aviso-archivado.component.css',
})
export class AvisoArchivadoComponent {
  ambito   = input.required<AmbitoArchivado>();
  /** `expediente.archivado_en`, si la pantalla lo tiene. */
  fecha    = input<string | null | undefined>(null);
  compacto = input(false);

  titulo = computed(() => {
    switch (this.ambito()) {
      case 'contrato': return 'archivo.titulo_contrato';
      case 'obra':     return 'archivo.titulo_obra';
      default:         return 'archivo.titulo_expediente';
    }
  });

  texto = computed(() => `archivo.texto_${this.ambito()}`);
}
