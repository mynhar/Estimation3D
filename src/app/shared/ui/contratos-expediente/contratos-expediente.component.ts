import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContratoPanelCliente, ServicioContrato } from '../../../models';

const LOCALES: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };

/**
 * Contratos del expediente en el panel del cliente: uno por constructor
 * adjudicado, cada uno con el avance de su obra, y el costo total al pie.
 *
 * Los cancelados se listan (al final y atenuados) pero no suman al total: el
 * cliente ya no los paga.
 */
@Component({
  selector: 'app-contratos-expediente',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './contratos-expediente.component.html',
  styleUrl: './contratos-expediente.component.css',
})
export class ContratosExpedienteComponent {
  private translate = inject(TranslateService);

  /** Todos los contratos del expediente, incluidos los cancelados. */
  contratos = input.required<ContratoPanelCliente[]>();

  private lang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  /** Vigentes primero, en el orden recibido; los cancelados al final. */
  ordenados = computed(() => {
    const cs = this.contratos();
    return [
      ...cs.filter(c => c.estado !== 'cancelado'),
      ...cs.filter(c => c.estado === 'cancelado'),
    ];
  });

  vigentes   = computed(() => this.contratos().filter(c => c.estado !== 'cancelado'));
  cancelados = computed(() => this.contratos().length - this.vigentes().length);
  costoTotal = computed(() => this.vigentes().reduce((s, c) => s + c.precio_final, 0));

  serviciosTexto(c: ContratoPanelCliente): string {
    return c.servicios.map(s => this.servicioNombre(s)).filter(Boolean).join(' · ');
  }

  private servicioNombre(s: ServicioContrato): string {
    const lang = this.lang();
    if (lang === 'en') return s.nombre_en || s.nombre_fr || s.nombre_es;
    if (lang === 'fr') return s.nombre_fr || s.nombre_es;
    return s.nombre_es;
  }

  formatPrecio(precio: number): string {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(precio);
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(LOCALES[this.lang()] ?? 'fr-CA', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(d);
  }

  formatGarantia(anos: number): string {
    const lang = this.lang();
    if (lang === 'fr') return anos === 1 ? '1 an'   : `${anos} ans`;
    if (lang === 'en') return anos === 1 ? '1 year' : `${anos} years`;
    return anos === 1 ? '1 año' : `${anos} años`;
  }
}
