import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow, ESTADOS_ESTIMADO } from '../../models';

interface EstadoCfg {
  color: string;
  label: string;
  icon:  string;
  pct:   number;
}

const ESTADO_CFG: Record<string, EstadoCfg> = {
  en_estimacion: { color: '#6366f1', label: 'En estimación', icon: 'bi-pencil-square',     pct: 30  },
  estimado:      { color: '#0d6efd', label: 'Estimado',       icon: 'bi-clipboard-check',   pct: 55  },
  en_oferta:     { color: '#d97706', label: 'En oferta',      icon: 'bi-people',            pct: 70  },
  adjudicado:    { color: '#ea580c', label: 'Adjudicado',     icon: 'bi-award',             pct: 85  },
  contratado:    { color: '#16a34a', label: 'Contratado',     icon: 'bi-check-circle-fill', pct: 100 },
  cancelado:     { color: '#94a3b8', label: 'Cancelado',      icon: 'bi-x-circle',          pct: 0   },
};

const PIPELINE_STEPS: string[] = [
  'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado',
];

const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

@Component({
  selector: 'app-estimator-dashboard',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class EstimatorDashboardComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteRow[]>([]);
  disponibles = signal(0);
  montoTotal  = signal(0);
  cargando    = signal(true);

  // ── Computed: grupos ──────────────────────────────────────────────────────
  activos = computed(() =>
    this.expedientes().filter(e => e.estado === 'en_estimacion')
  );

  postEstimacion = computed(() =>
    this.expedientes().filter(e => e.estado != null && ESTADOS_ESTIMADO.includes(e.estado as import('../../types/supabase').EstadoExpediente))
  );

  enMercado = computed(() =>
    this.expedientes().filter(e =>
      ['en_oferta', 'adjudicado'].includes(e.estado ?? '')
    )
  );

  contratados = computed(() =>
    this.expedientes().filter(e => e.estado === 'contratado')
  );

  totalCompletados = computed(() =>
    this.expedientes().filter(e =>
      e.estado !== 'en_estimacion' && e.estado !== 'cancelado'
    ).length
  );

  tasaExito = computed(() => {
    const base = this.expedientes().filter(e =>
      e.estado !== 'en_estimacion' && e.estado !== 'cancelado'
    ).length;
    if (base === 0) return 0;
    return Math.round(this.contratados().length / base * 100);
  });

  // ── Donut SVG ─────────────────────────────────────────────────────────────
  readonly R             = R;
  readonly CIRCUMFERENCE = CIRCUMFERENCE;
  readonly pipelineSteps = PIPELINE_STEPS;

  donutSegments = computed(() => {
    const total = this.expedientes().length;
    if (!total) return [];
    let offset = 0;
    const segs: { label: string; color: string; dasharray: string; dashoffset: number }[] = [];
    for (const key of [...PIPELINE_STEPS, 'cancelado']) {
      const count = this.expedientes().filter(e => e.estado === key).length;
      if (!count) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({
        label:      ESTADO_CFG[key].label,
        color:      ESTADO_CFG[key].color,
        dasharray:  `${portion} ${CIRCUMFERENCE}`,
        dashoffset: -offset,
      });
      offset += portion;
    }
    return segs;
  });

  estadoBreakdown = computed(() =>
    ([...PIPELINE_STEPS, 'cancelado'] as string[])
      .map(key => ({
        key,
        ...ESTADO_CFG[key],
        count: this.expedientes().filter(e => e.estado === key).length,
        pct:   this.expedientes().length > 0
          ? Math.round(
              this.expedientes().filter(e => e.estado === key).length /
              this.expedientes().length * 100
            )
          : 0,
      }))
      .filter(e => e.count > 0)
  );

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }

    try {
      const [allMine, nuevos, estimacionesRes] = await Promise.all([
        this.expedienteService.getExpedienteRows({
          estados:     (['en_estimacion', ...ESTADOS_ESTIMADO] as import('../../types/supabase').EstadoExpediente[]),
          estimadorId: userId,
        }),
        this.expedienteService.getExpedienteRows({ estado: 'nuevo' }),
        this.auth.client
          .from('estimacion')
          .select('costo_estimado')
          .eq('estimador_id', userId)
          .not('costo_estimado', 'is', null),
      ]);

      this.expedientes.set(allMine);
      this.disponibles.set(nuevos.length);
      this.montoTotal.set(
        (estimacionesRes.data ?? [])
          .reduce((s: number, e: any) => s + (e.costo_estimado ?? 0), 0)
      );
    } catch (e: any) {
      console.error('[EstimatorDashboard]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  cfg(estado: string): EstadoCfg {
    return ESTADO_CFG[estado] ?? ESTADO_CFG['estimado'];
  }

  stepDone(currentEstado: string, step: string): boolean {
    const ci = PIPELINE_STEPS.indexOf(currentEstado);
    const si = PIPELINE_STEPS.indexOf(step);
    return ci > si && ci >= 0 && si >= 0;
  }

  stepActive(currentEstado: string, step: string): boolean {
    return currentEstado === step;
  }

  urgencia(fechaVisita: string): 'vencida' | 'hoy' | 'proxima' | null {
    if (!fechaVisita) return null;
    const d    = new Date(`${fechaVisita}T00:00:00`);
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const diff = d.getTime() - hoy.getTime();
    if (diff < 0)                        return 'vencida';
    if (diff === 0)                      return 'hoy';
    if (diff <= 2 * 24 * 60 * 60 * 1000) return 'proxima';
    return null;
  }

  formatPrecio(v: number): string {
    return `₡ ${v.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  get bienvenida(): string {
    const u = this.user();
    return u?.user_metadata?.['full_name']?.split(' ')[0]
        ?? u?.email?.split('@')[0]
        ?? '';
  }

  irAEstimar(id: string) { this.router.navigate(['/estimator/file-under-estimation', id]); }
  irAVer(id: string)     { this.router.navigate(['/estimator/estimated-file', id]); }
}
