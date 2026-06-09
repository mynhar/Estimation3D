import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';
import { ExpedienteConOfertaAdmin } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-admin-offer-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminOfferListComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  private _expedientes = signal<ExpedienteConOfertaAdmin[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroEstado = signal('todos');

  readonly estados    = ['todos', 'estimado', 'en_oferta', 'adjudicado'];
  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  expedientesFiltrados = computed(() => {
    const q      = this.busqueda().toLowerCase().trim();
    const estado = this.filtroEstado();

    return this._expedientes().filter(e => {
      if (estado !== 'todos' && e.estado !== estado) return false;
      if (q) {
        const haystack = [
          e.numero,
          e.cliente_nombre,
          this.servicioNombre(e),
          e.estado,
          e.estimador_nombre   ?? '',
          e.constructor_nombre ?? '',
          e.oferta_estado      ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
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
      this._expedientes.set(await this.expedienteService.getExpedientesConOfertasAdmin());
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

  servicioNombre(exp: ExpedienteConOfertaAdmin): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  estadoBadgeExp(estado: string): string {
    const map: Record<string, string> = {
      estimado:   'badge-estimado',
      en_oferta:  'badge-en_oferta',
      adjudicado: 'badge-adjudicado',
    };
    return map[estado] ?? 'badge-estimado';
  }

  estadoBadgeOferta(estado: string | null): string {
    if (!estado) return '';
    const map: Record<string, string> = {
      pendiente: 'badge-oferta-pendiente',
      aceptada:  'badge-oferta-aceptada',
      rechazada: 'badge-oferta-rechazada',
    };
    return map[estado] ?? '';
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

  formatPrecio(precio: number | null): string {
    if (precio == null) return '—';
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(precio);
  }

  irAEditar(id: string): void {
    this.router.navigate(['/admin/offer/edit', id]);
  }
}
