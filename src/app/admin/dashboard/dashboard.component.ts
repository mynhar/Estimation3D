import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { AdminDashboardService, DashboardStats, TimelineEvent } from './admin-dashboard.service';

const EXP_PIPELINE = ['nuevo','en_estimacion','estimado','en_oferta','adjudicado','contratado'] as const;
const OFE_ESTADOS  = ['pendiente','aceptada','rechazada'] as const;
const CTR_ESTADOS  = ['generado','firmado','en_ejecucion','completado','cancelado'] as const;
const OBRA_ESTADOS = ['no_iniciado','en_progreso','pausado','completado'] as const;

interface FunnelItem { estado: string; count: number }

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, PaginationComponent, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl:    './dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  private svc       = inject(AdminDashboardService);
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);
  private router    = inject(Router);

  user   = toSignal(this.auth.user$);
  perfil = signal<{ nombre: string | null; apellido: string | null } | null>(null);

  stats            = signal<DashboardStats | null>(null);
  timeline         = signal<TimelineEvent[]>([]);
  cargando         = signal(true);
  cargandoTimeline = signal(true);
  error            = signal<string | null>(null);
  refreshedAt      = signal('');
  filtroTimeline   = signal('todos');
  vistaTimeline    = signal<'tabla' | 'tarjetas'>('tabla');   // por defecto: tabla
  paginaTl         = signal(1);
  readonly TL_POR_PAGINA = 10;

  readonly timelineFiltros = [
    { key: 'todos',      labelKey: 'common.all' },
    { key: 'expediente', labelKey: 'admin_dashboard.tl_filter_exp' },
    { key: 'estimacion', labelKey: 'admin_dashboard.tl_filter_est' },
    { key: 'oferta',     labelKey: 'admin_dashboard.tl_filter_ofe' },
    { key: 'contrato',   labelKey: 'admin_dashboard.tl_filter_ctr' },
    { key: 'obra',       labelKey: 'admin_dashboard.tl_filter_obra' },
  ];

  timelineFiltrada = computed(() => {
    const f = this.filtroTimeline();
    const all = this.timeline();
    return f === 'todos' ? all : all.filter(e => e.tipo === f);
  });

  timelinePaginada = computed(() => {
    const items = this.timelineFiltrada();
    const page  = this.paginaTl();
    const start = (page - 1) * this.TL_POR_PAGINA;
    return items.slice(start, start + this.TL_POR_PAGINA);
  });

  setFiltroTimeline(key: string): void {
    this.filtroTimeline.set(key);
    this.paginaTl.set(1);
  }

  funnelExp = computed((): FunnelItem[] => {
    const s = this.stats();
    if (!s) return [];
    return EXP_PIPELINE.map(estado => ({ estado, count: s.expedientes.porEstado[estado] ?? 0 }));
  });

  funnelOfe = computed((): FunnelItem[] => {
    const s = this.stats();
    if (!s) return [];
    return OFE_ESTADOS.map(estado => ({ estado, count: s.ofertas.porEstado[estado] ?? 0 }));
  });

  funnelCtr = computed((): FunnelItem[] => {
    const s = this.stats();
    if (!s) return [];
    return CTR_ESTADOS.map(estado => ({ estado, count: s.contratos.porEstado[estado] ?? 0 }));
  });

  funnelObra = computed((): FunnelItem[] => {
    const s = this.stats();
    if (!s) return [];
    return OBRA_ESTADOS.map(estado => ({ estado, count: s.obras.porEstado[estado] ?? 0 }));
  });

  obrasTotal       = computed(() => this.stats()?.obras.total ?? 0);
  obrasEnProgreso  = computed(() => this.stats()?.obras.porEstado['en_progreso'] ?? 0);
  obrasCompletadas = computed(() => this.stats()?.obras.porEstado['completado'] ?? 0);
  avanceMedioObra  = computed(() => this.stats()?.obras.avanceMedio ?? 0);

  expCancelados = computed(() => this.stats()?.expedientes.porEstado['cancelado'] ?? 0);
  expSinAsignar = computed(() => this.stats()?.expedientes.porEstado['nuevo'] ?? 0);
  expEnEstimacion = computed(() => this.stats()?.expedientes.porEstado['en_estimacion'] ?? 0);

  get bienvenida(): string {
    const p = this.perfil();
    if (p?.nombre) {
      return [p.nombre, p.apellido].filter(Boolean).join(' ');
    }
    const u = this.user();
    return u?.user_metadata?.['full_name'] ?? u?.email?.split('@')[0] ?? '';
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (userId) {
      const { data } = await this.auth.client
        .from('perfil')
        .select('nombre, apellido')
        .eq('id', userId)
        .single();
      if (data) this.perfil.set(data);
    }
    await this.cargar();
  }

  async recargar() {
    this.cargando.set(true);
    this.error.set(null);
    await this.cargar();
  }

  private async cargar() {
    try {
      const [stats, tl] = await Promise.all([
        this.svc.getStats(),
        this.svc.getTimeline(),
      ]);
      this.stats.set(stats);
      this.timeline.set(tl);
      this.refreshedAt.set(
        new Intl.DateTimeFormat('fr-CA', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date())
      );
    } catch (e: any) {
      this.error.set(e?.message ?? this.translate.instant('admin_dashboard.err_load'));
    } finally {
      this.cargando.set(false);
      this.cargandoTimeline.set(false);
    }
  }

  barWidth(count: number, total: number): number {
    if (!total || !count) return 0;
    return Math.max(3, Math.round((count / total) * 100));
  }

  formatPrecio(valor: number | null | undefined): string {
    if (valor == null || valor === 0) return '—';
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(valor);
  }

  formatTs(ts: string): string {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  tipoIcon(tipo: string): string {
    const m: Record<string, string> = {
      expediente: 'bi bi-folder2',
      estimacion: 'bi bi-clipboard-data',
      oferta:     'bi bi-box',
      contrato:   'bi bi-file-earmark-text',
      obra:       'bi bi-hammer',
    };
    return m[tipo] ?? 'bi bi-circle';
  }

  /** Ruta de edición por tipo de evento (la línea de actividad es clicable). */
  private readonly TL_RUTA: Record<TimelineEvent['tipo'], string> = {
    expediente: '/admin/file/edit',
    estimacion: '/admin/to-estimate/edit',
    oferta:     '/admin/offer/edit',
    contrato:   '/admin/contract/edit',
    obra:       '/admin/construction-monitoring/monitoring',
  };

  onTimelineClick(ev: TimelineEvent): void {
    if (!ev.entityId) return;
    const ruta = this.TL_RUTA[ev.tipo];
    if (ruta) this.router.navigate([ruta, ev.entityId]);
  }

  /** Navega a la lista de expedientes por estimar filtrada por estado. */
  irAEstimaciones(estado: 'nuevo' | 'en_estimacion' | 'estimado'): void {
    this.router.navigate(['/admin/to-estimate'], { queryParams: { estado } });
  }

  /** Navega a la lista de usuarios filtrada por constructores activos. */
  irAConstructoresActivos(): void {
    this.router.navigate(['/admin/user'], { queryParams: { rol: 'constructor', activo: 'activo' } });
  }

  /** Navega a la lista de ofertas filtrada por estado de expediente. */
  irAOfertas(estado: 'estimado' | 'en_oferta' | 'adjudicado'): void {
    this.router.navigate(['/admin/offer'], { queryParams: { estado } });
  }

  /** Navega al seguimiento de obra filtrado por estado de contrato. */
  irASeguimientoObra(estado: 'todos' | 'en_ejecucion' | 'completado'): void {
    this.router.navigate(['/admin/construction-monitoring/list'], { queryParams: { estado } });
  }

}
