import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { OfertaService } from '../../services/oferta.service';
import { OfertaRow } from '../../models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

const ESTADO_ICON: Record<string, string> = {
  pendiente: 'bi-hourglass',
  aceptada:  'bi-check-circle',
  rechazada: 'bi-x-circle',
};

type VistaOfertas = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-my-offers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, TranslatePipe, PaginationComponent],
  templateUrl: './my-offers.component.html',
  styleUrl: './my-offers.component.css',
})
export class MyOffersComponent implements OnInit {
  private auth          = inject(AuthSupabaseService);
  private ofertaService = inject(OfertaService);
  private translate     = inject(TranslateService);
  private router        = inject(Router);

  user     = toSignal(this.auth.user$);
  ofertas  = signal<OfertaRow[]>([]);
  cargando = signal(true);

  // ── Vista (tarjetas por defecto) ───────────────────────────────────────────
  vista = signal<VistaOfertas>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  // ── Filtros ───────────────────────────────────────────────────────────────
  busqueda     = signal('');
  filtroEstado = signal<'todos'|'pendiente'|'aceptada'|'rechazada'>('todos');

  // ── Paginación ────────────────────────────────────────────────────────────
  readonly POR_PAGINA = 9;
  paginaActual = signal(1);

  hayFiltros = computed(() =>
    this.busqueda()     !== ''     ||
    this.filtroEstado() !== 'todos'
  );

  ofertasFiltradas = computed(() => {
    const q  = this.busqueda().toLowerCase().trim();
    const fe = this.filtroEstado();
    return this.ofertas()
      .filter(o => {
        if (fe !== 'todos' && o.estado !== fe) return false;
        if (q && !(
          o.expediente_numero.toLowerCase().includes(q)  ||
          o.servicio_nombre.toLowerCase().includes(q)    ||
          o.servicio_nombre_en.toLowerCase().includes(q) ||
          o.servicio_nombre_fr.toLowerCase().includes(q) ||
          o.provincia.toLowerCase().includes(q)          ||
          o.canton.toLowerCase().includes(q)
        )) return false;
        return true;
      })
      .sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());
  });

  ofertasPaginadas = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.ofertasFiltradas().slice(desde, desde + this.POR_PAGINA);
  });

  totalPendientes = computed(() => this.ofertas().filter(o => o.estado === 'pendiente').length);
  totalAceptadas  = computed(() => this.ofertas().filter(o => o.estado === 'aceptada').length);
  totalRechazadas = computed(() => this.ofertas().filter(o => o.estado === 'rechazada').length);

  montoAdjudicado = computed(() =>
    this.ofertas()
      .filter(o => o.estado === 'aceptada')
      .reduce((s, o) => s + o.precio, 0)
  );

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroEstado();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.ofertas.set(await this.ofertaService.getMisOfertas(userId));
    } catch (e: any) {
      console.error('[MyOffers]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  servicioNombre(o: OfertaRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return o.servicio_nombre_en || o.servicio_nombre;
    if (lang === 'fr') return o.servicio_nombre_fr || o.servicio_nombre;
    return o.servicio_nombre;
  }

  estadoIcon(estado: string):  string { return ESTADO_ICON[estado]  ?? 'bi-circle'; }

  setVista(v: VistaOfertas) {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del tour 3D Matterport.
   * Null si el expediente no tiene tour o si la imagen ya falló al cargar.
   */
  fotoExpediente(o: OfertaRow): string | null {
    return this.fotosFallidas().has(o.id) ? null : o.foto;
  }

  onFotoError(id: string) {
    this.fotosFallidas.update(set => new Set(set).add(id));
  }

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(valor);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  formatFechaCorta(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    if (min === max)  return `${min} sem.`;
    return `${min ?? '?'} – ${max ?? '?'} sem.`;
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set('todos');
  }

  ver(id: string) { this.router.navigate(['/builder/my-offer', id]); }
}
