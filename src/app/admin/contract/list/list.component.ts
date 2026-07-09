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
import { ContratoService } from '../../../services/contrato.service';
import { ContratoAdminListItem } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-admin-contract-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminContractListComponent implements OnInit {
  private contratoService = inject(ContratoService);
  private translate       = inject(TranslateService);
  private router          = inject(Router);

  private _contratos = signal<ContratoAdminListItem[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroEstado = signal('todos');
  vista        = signal<'tabla' | 'tarjetas'>('tabla');   // por defecto: tabla

  readonly estados    = ['todos', 'generado', 'firmado', 'en_ejecucion', 'completado', 'cancelado'];
  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  contratosFiltrados = computed(() => {
    const q      = this.busqueda().toLowerCase().trim();
    const estado = this.filtroEstado();

    return this._contratos().filter(c => {
      if (estado !== 'todos' && c.contrato_estado !== estado) return false;
      if (q) {
        const haystack = [
          c.expediente_numero,
          c.cliente_nombre,
          this.servicioNombre(c),
          c.expediente_estado,
          c.estimador_nombre    ?? '',
          c.constructor_nombre  ?? '',
          c.contrato_estado,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  contratosPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.contratosFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' || this.filtroEstado() !== 'todos'
  );

  estadoCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const c of this._contratos()) {
      counts[c.contrato_estado] = (counts[c.contrato_estado] ?? 0) + 1;
    }
    return counts;
  });

  get total(): number { return this._contratos().length; }

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroEstado();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit() {
    try {
      this._contratos.set(await this.contratoService.getContratosAdmin());
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

  servicioNombre(c: ContratoAdminListItem): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return c.servicio_nombre_en || c.servicio_nombre;
    if (lang === 'fr') return c.servicio_nombre_fr || c.servicio_nombre;
    return c.servicio_nombre;
  }

  badgeExpediente(estado: string): string {
    const map: Record<string, string> = {
      adjudicado: 'badge-adjudicado',
      contratado: 'badge-contratado',
      en_oferta:  'badge-en-oferta',
      estimado:   'badge-estimado',
    };
    return map[estado] ?? 'badge-en-oferta';
  }

  badgeContrato(estado: string): string {
    const map: Record<string, string> = {
      generado:     'badge-contrato-generado',
      firmado:      'badge-contrato-firmado',
      en_ejecucion: 'badge-contrato-en-ejecucion',
      completado:   'badge-contrato-completado',
      cancelado:    'badge-contrato-cancelado',
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
    this.router.navigate(['/admin/contract/edit', id]);
  }
}
