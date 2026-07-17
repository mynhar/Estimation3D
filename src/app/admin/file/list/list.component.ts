import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
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

  /** Lo que se ve en el input: se actualiza en cada tecla. */
  busqueda     = signal('');
  /** Lo que dispara la consulta: se actualiza tras la pausa del debounce. */
  private busquedaAplicada = signal('');
  private debounceId?: ReturnType<typeof setTimeout>;
  private readonly DEBOUNCE_MS = 300;

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
    // Carga server-side cuando cambia cualquier parámetro de búsqueda o página.
    // Depende de `busquedaAplicada`, no de `busqueda`: así no se lanza una
    // consulta por tecla.
    effect(() => {
      const page     = this.paginaActual();
      const estado   = this.filtroEstado();
      const busqueda = this.busquedaAplicada();
      untracked(() => this.cargar(page, estado, busqueda));
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounceId));
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
    const valor = (e.target as HTMLInputElement).value;
    this.busqueda.set(valor);
    clearTimeout(this.debounceId);
    this.debounceId = setTimeout(() => this.aplicarBusqueda(valor), this.DEBOUNCE_MS);
  }

  private aplicarBusqueda(valor: string) {
    this.paginaActual.set(1);
    this.busquedaAplicada.set(valor);
  }

  clearBusqueda() {
    clearTimeout(this.debounceId);
    this.busqueda.set('');
    this.aplicarBusqueda('');
  }

  setFiltroEstado(estado: string) {
    this.filtroEstado.set(estado);
    this.paginaActual.set(1);
  }

  limpiarFiltros() {
    clearTimeout(this.debounceId);
    this.busqueda.set('');
    this.filtroEstado.set('todos');
    this.aplicarBusqueda('');
  }

  servicioNombre(exp: ExpedienteAdmin): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  // ── Dirección ──────────────────────────────────────────────────────────────
  // Formato postal: `direccion` ya combina nº de unidad, nº cívico y calle
  // ("615-150 rue Berlioz"); la 2ª línea lleva ciudad, provincia y CP.
  direccionLinea1(e: ExpedienteAdmin): string {
    return e.direccion?.trim() ?? '';
  }

  direccionLinea2(e: ExpedienteAdmin): string {
    return [e.canton, e.provincia, e.distrito]
      .map(v => v?.trim())
      .filter(Boolean)
      .join(' ');
  }

  /** Dirección completa en una línea, para el `title` cuando el texto se abrevia. */
  direccionCompleta(e: ExpedienteAdmin): string {
    return [this.direccionLinea1(e), this.direccionLinea2(e)].filter(Boolean).join(', ');
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
