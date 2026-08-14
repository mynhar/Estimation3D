import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ExpedienteParaEstimar } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import {
  coincideBusqueda, direccionLinea1, direccionLinea2, direccionCompleta,
} from '../../../shared/util/busqueda';

type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-admin-to-estimate-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminToEstimateListComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);
  private route             = inject(ActivatedRoute);

  private _expedientes = signal<ExpedienteParaEstimar[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroEstado = signal('todos');
  vista        = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  readonly estados = ['todos', 'nuevo', 'en_estimacion', 'estimado'];

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
          e.estimador_nombre ?? '',
          // Dirección: en Canadá `direccion` lleva unidad + nº y calle,
          // `canton` la ciudad y `distrito` el código postal.
          e.direccion,
          e.canton,
          e.provincia,
          e.distrito,
        ].join(' ').toLowerCase();
        if (!coincideBusqueda(haystack, q)) return false;
      }
      return true;
    });
  });

  // ── Dirección (formato postal en dos líneas) ─────────────────────────────
  direccionLinea1   = direccionLinea1;
  direccionLinea2   = direccionLinea2;
  direccionCompleta = direccionCompleta;

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
    const estadoParam = this.route.snapshot.queryParamMap.get('estado');
    if (estadoParam && this.estados.includes(estadoParam)) {
      this.filtroEstado.set(estadoParam);
    }
    try {
      this._expedientes.set(await this.expedienteService.getExpedientesParaEstimar());
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

  servicioNombre(exp: ExpedienteParaEstimar): string {
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
    };
    return map[estado] ?? 'badge-nuevo';
  }

  editRoute(exp: ExpedienteParaEstimar): string[] {
    return ['/admin/to-estimate/edit', exp.id];
  }

  irAEditar(id: string): void {
    this.router.navigate(['/admin/to-estimate/edit', id]);
  }

  setVista(v: VistaExpedientes): void {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del primer tour 3D Matterport adjunto.
   * Devuelve null si no hay tour Matterport o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteParaEstimar): string | null {
    if (this.fotosFallidas().has(exp.id)) return null;
    const modelId = this.matterportModelId(exp.url_tour);
    return modelId
      ? `https://my.matterport.com/api/v1/player/models/${modelId}/thumb?width=640&dpr=1`
      : null;
  }

  onFotoError(id: string): void {
    this.fotosFallidas.update(set => {
      const next = new Set(set);
      next.add(id);
      return next;
    });
  }

  /** Extrae el id del modelo Matterport (`?m=<id>`) del primer URL de tour. */
  private matterportModelId(urlTour: string | null): string | null {
    const [primera] = EstimacionService.parseUrls(urlTour);
    if (!primera || !/matterport\.com/i.test(primera)) return null;
    const match = primera.match(/[?&]m=([^&]+)/);
    return match ? match[1] : null;
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  formatCosto(min: number | null, max: number | null): string {
    if (min == null) return '—';
    const fmt = (v: number) => new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(v);
    return max != null && max !== min ? `${fmt(min)} – ${fmt(max)}` : fmt(min);
  }
}
