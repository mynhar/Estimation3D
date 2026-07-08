import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ExpedienteAdmin } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-admin-file-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminFileListComponent {
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  expedientes  = signal<ExpedienteAdmin[]>([]);
  totalItems   = signal(0);
  cargando     = signal(true);
  error        = signal<string | null>(null);

  busqueda     = signal('');
  filtroEstado = signal('todos');
  vista        = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  readonly estados = [
    'todos', 'nuevo', 'en_estimacion', 'estimado',
    'en_oferta', 'adjudicado', 'contratado', 'cancelado',
  ];

  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  hayFiltros = computed(() =>
    this.busqueda() !== '' || this.filtroEstado() !== 'todos'
  );

  constructor() {
    // Carga server-side cuando cambia cualquier parámetro de búsqueda o página
    effect(() => {
      const page     = this.paginaActual();
      const estado   = this.filtroEstado();
      const busqueda = this.busqueda();
      untracked(() => this.cargar(page, estado, busqueda));
    });
  }

  private async cargar(page: number, estado: string, busqueda: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const result = await this.expedienteService.getExpedientesAdmin({
        page,
        pageSize: this.POR_PAGINA,
        estado,
        busqueda,
      });
      this.expedientes.set(result.items);
      this.totalItems.set(result.total);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  setBusqueda(e: Event) {
    this.busqueda.set((e.target as HTMLInputElement).value);
    this.paginaActual.set(1);
  }

  clearBusqueda() {
    this.busqueda.set('');
    this.paginaActual.set(1);
  }

  setFiltroEstado(estado: string) {
    this.filtroEstado.set(estado);
    this.paginaActual.set(1);
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set('todos');
    this.paginaActual.set(1);
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

  irAEditar(id: string): void {
    this.router.navigate(['/admin/file/edit', id]);
  }

  setVista(v: VistaExpedientes): void {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del primer tour 3D Matterport adjunto.
   * Devuelve null si no hay tour Matterport o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteAdmin): string | null {
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
}
