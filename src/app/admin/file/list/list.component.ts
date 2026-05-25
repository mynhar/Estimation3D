import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';
import { ExpedienteAdmin } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-admin-file-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminFileListComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);

  private _expedientes = signal<ExpedienteAdmin[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroEstado = signal('todos');

  readonly estados = [
    'todos', 'nuevo', 'en_estimacion', 'estimado',
    'en_oferta', 'adjudicado', 'contratado', 'cancelado',
  ];

  // ── Paginación ─────────────────────────────────────────────────────────────
  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  expedientesFiltrados = computed(() => {
    const q      = this.busqueda().toLowerCase().trim();
    const estado = this.filtroEstado();

    return this._expedientes().filter(e => {
      if (estado !== 'todos' && e.estado !== estado) return false;
      if (q && !`${e.numero} ${this.servicioNombre(e)} ${e.cliente_nombre}`
                .toLowerCase().includes(q)) return false;
      return true;
    });
  });

  expedientesPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.expedientesFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' || this.filtroEstado() !== 'todos'
  );

  estadoCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const e of this._expedientes()) {
      counts[e.estado] = (counts[e.estado] ?? 0) + 1;
    }
    return counts;
  });

  get total(): number { return this._expedientes().length; }

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroEstado();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit() {
    try {
      this._expedientes.set(await this.expedienteService.getExpedientesAdmin());
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set('todos');
  }

  setBusqueda(e: Event) {
    this.busqueda.set((e.target as HTMLInputElement).value);
  }

  servicioNombre(exp: ExpedienteAdmin): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  estadoBadge(estado: string): string {
    const map: Record<string, string> = {
      nuevo:         'badge-nuevo',
      en_estimacion: 'badge-en_estimacion',
      estimado:      'badge-estimado',
      en_oferta:     'badge-en_oferta',
      adjudicado:    'badge-adjudicado',
      contratado:    'badge-contratado',
      cancelado:     'badge-cancelado',
    };
    return map[estado] ?? 'badge-nuevo';
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  formatPrecio(valor: number | null): string {
    if (valor == null) return '—';
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(valor);
  }
}
