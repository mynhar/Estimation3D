import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { AdminDashboardService, DashboardStats, TimelineEvent } from './admin-dashboard.service';

const EXP_PIPELINE = ['nuevo','en_estimacion','estimado','en_oferta','adjudicado','contratado'] as const;
const OFE_ESTADOS  = ['pendiente','aceptada','rechazada'] as const;
const CTR_ESTADOS  = ['generado','firmado','en_ejecucion','completado','cancelado'] as const;

interface FunnelItem { estado: string; count: number }

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, PaginationComponent],
  templateUrl: './dashboard.component.html',
  styleUrl:    './dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  private svc = inject(AdminDashboardService);

  stats            = signal<DashboardStats | null>(null);
  timeline         = signal<TimelineEvent[]>([]);
  cargando         = signal(true);
  cargandoTimeline = signal(true);
  error            = signal<string | null>(null);
  refreshedAt      = signal('');
  filtroTimeline   = signal('todos');
  paginaTl         = signal(1);
  readonly TL_POR_PAGINA = 10;

  readonly timelineFiltros = [
    { key: 'todos',      labelKey: 'common.all' },
    { key: 'expediente', labelKey: 'admin_dashboard.tl_filter_exp' },
    { key: 'estimacion', labelKey: 'admin_dashboard.tl_filter_est' },
    { key: 'oferta',     labelKey: 'admin_dashboard.tl_filter_ofe' },
    { key: 'contrato',   labelKey: 'admin_dashboard.tl_filter_ctr' },
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

  private _resetPagina = effect(() => {
    this.filtroTimeline();
    this.paginaTl.set(1);
  });

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

  expCancelados = computed(() => this.stats()?.expedientes.porEstado['cancelado'] ?? 0);
  expSinAsignar = computed(() => this.stats()?.expedientes.porEstado['nuevo'] ?? 0);
  expEnEstimacion = computed(() => this.stats()?.expedientes.porEstado['en_estimacion'] ?? 0);

  async ngOnInit() { await this.cargar(); }

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
      this.error.set(e.message ?? 'Error cargando datos del dashboard');
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
    return new Intl.DateTimeFormat('es-CR', {
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
    };
    return m[tipo] ?? 'bi bi-circle';
  }

}
