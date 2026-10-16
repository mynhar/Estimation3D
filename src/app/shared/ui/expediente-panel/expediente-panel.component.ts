import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

let siguienteId = 0;

/**
 * Tarjeta plegable de un expediente: cabecera con carpeta, número, un hueco
 * para cifras (`[panelMeta]`) y chevron; el cuerpo se proyecta y solo se pinta
 * abierta. Misma presentación que /client/my-documents/list, para que las
 * listas del cliente agrupadas por expediente (contratos, seguimiento de obra)
 * se lean igual.
 *
 * El estado abierto/cerrado lo lleva quien la usa (`abierto` + `alternar`):
 * así decide qué expediente arranca abierto y lo conserva al recargar datos.
 */
@Component({
  selector: 'app-expediente-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './expediente-panel.component.html',
  styleUrl: './expediente-panel.component.css',
})
export class ExpedientePanelComponent {
  numero  = input.required<string>();
  abierto = input(false);
  /** Cuerpo sobre fondo alterno: para cuando dentro van tarjetas, no filas. */
  bandeja = input(false);

  alternar = output<void>();

  readonly cuerpoId = `xp-cuerpo-${++siguienteId}`;
}
