import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { SeguimientoService } from '../../services/seguimiento.service';
import { ExpedienteRow, ESTADOS_ESTIMADO } from '../../models';
import { EstadoExpediente } from '../../types/supabase';

// Config por estado. El color vive en el CSS como clase semántica (token);
// aquí solo el icono, el % del pipeline y la clase — nunca hex inline.
interface EstadoCfg {
  label: string;
  icon:  string;
  pct:   number;
  cls:   string;
}

const ESTADO_CFG: Record<string, EstadoCfg> = {
  en_estimacion: { label: 'En estimación', icon: 'bi-pencil-square',   pct: 30,  cls: 'is-info'        },
  estimado:      { label: 'Estimado',       icon: 'bi-clipboard-check', pct: 55,  cls: 'is-gold'        },
  en_oferta:     { label: 'En oferta',      icon: 'bi-people',          pct: 70,  cls: 'is-warning'     },
  adjudicado:    { label: 'Adjudicado',     icon: 'bi-award',           pct: 85,  cls: 'is-gold-strong' },
  contratado:    { label: 'Contratado',     icon: 'bi-check-circle',    pct: 100, cls: 'is-success'     },
  cancelado:     { label: 'Cancelado',      icon: 'bi-x-circle',        pct: 0,   cls: 'is-muted'       },
};

const PIPELINE_STEPS: string[] = [
  'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado',
];

const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Resumen de una obra (expediente contratado en construcción).
interface ObraResumen {
  expedienteId:     string;
  numero:           string;
  servicioNombre:   string;
  servicioNombreEn: string;
  servicioNombreFr: string;
  clienteNombre:    string;
  estado:           string;   // estado del seguimiento_obra
  avance:           number;
  actualizadoEn:    string;
}

@Component({
  selector: 'app-estimator-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class EstimatorDashboardComponent implements OnInit {
  private auth               = inject(AuthSupabaseService);
  private expedienteService  = inject(ExpedienteService);
  private estimacionService  = inject(EstimacionService);
  private seguimientoService = inject(SeguimientoService);
  private translate          = inject(TranslateService);
  private router             = inject(Router);

  user        = toSignal(this.auth.user$);
  perfil      = signal<{ nombre: string | null; apellido: string | null } | null>(null);
  expedientes = signal<ExpedienteRow[]>([]);
  obras       = signal<ObraResumen[]>([]);
  disponibles = signal(0);
  montoTotal  = signal(0);
  cargando    = signal(true);

  // ── Computed: grupos ──────────────────────────────────────────────────────
  activos = computed(() =>
    this.expedientes().filter(e => e.estado === 'en_estimacion')
  );

  postEstimacion = computed(() =>
    this.expedientes().filter(e => e.estado != null && ESTADOS_ESTIMADO.includes(e.estado as EstadoExpediente))
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

  // ── Computed: obra ─────────────────────────────────────────────────────────
  obrasEnCurso = computed(() => this.obras().filter(o => o.estado !== 'completado').length);
  avanceMedio  = computed(() => {
    const o = this.obras();
    return o.length === 0 ? 0 : Math.round(o.reduce((s, x) => s + x.avance, 0) / o.length);
  });

  // ── Donut SVG ─────────────────────────────────────────────────────────────
  readonly R             = R;
  readonly CIRCUMFERENCE = CIRCUMFERENCE;
  readonly pipelineSteps = PIPELINE_STEPS;

  donutSegments = computed(() => {
    const total = this.expedientes().length;
    if (!total) return [];
    let offset = 0;
    const segs: { cls: string; dasharray: string; dashoffset: number }[] = [];
    for (const key of [...PIPELINE_STEPS, 'cancelado']) {
      const count = this.expedientes().filter(e => e.estado === key).length;
      if (!count) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({
        cls:        ESTADO_CFG[key].cls,
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
      const { data: perfilData } = await this.auth.client
        .from('perfil')
        .select('nombre, apellido')
        .eq('id', userId)
        .single();
      if (perfilData) this.perfil.set(perfilData);

      const [allMine, nuevos, montoTotal] = await Promise.all([
        this.expedienteService.getExpedienteRows({
          estados:     (['en_estimacion', ...ESTADOS_ESTIMADO] as EstadoExpediente[]),
          estimadorId: userId,
        }),
        this.expedienteService.getExpedienteRows({ estado: 'nuevo' }),
        this.estimacionService.getMontoTotalPorEstimador(userId),
      ]);

      this.expedientes.set(allMine);
      this.disponibles.set(nuevos.length);
      this.montoTotal.set(montoTotal);

      // Seguimiento de obra: avance de los expedientes contratados en construcción.
      const contratadosIds = allMine.filter(e => e.estado === 'contratado').map(e => e.id);
      if (contratadosIds.length) {
        const resumen = await this.seguimientoService.getResumenByExpedienteIds(contratadosIds);
        const porExp  = new Map(resumen.map(r => [r.expediente_id, r]));
        const obras: ObraResumen[] = [];
        for (const e of allMine) {
          const seg = porExp.get(e.id);
          if (!seg) continue;
          obras.push({
            expedienteId:     e.id,
            numero:           e.numero,
            servicioNombre:   e.servicio_nombre,
            servicioNombreEn: e.servicio_nombre_en,
            servicioNombreFr: e.servicio_nombre_fr,
            clienteNombre:    e.cliente_nombre,
            estado:           seg.estado,
            avance:           seg.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance),
            actualizadoEn:    seg.actualizado_en,
          });
        }
        obras.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
        this.obras.set(obras);
      }
    } catch (e: unknown) {
      console.error('[EstimatorDashboard]', e instanceof Error ? e.message : String(e));
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  cfg(estado: string): EstadoCfg {
    return ESTADO_CFG[estado] ?? ESTADO_CFG['estimado'];
  }

  obraEstadoCls(estado: string): string {
    return estado === 'completado'  ? 'is-success'
         : estado === 'en_progreso' ? 'is-gold-strong'
         : estado === 'pausado'     ? 'is-warning'
         : 'is-info';
  }

  obraEstadoLabel(estado: string): string {
    // estado del seguimiento → clave i18n
    return 'seguimiento_estado.' + estado;
  }

  stepDone(currentEstado: string, step: string): boolean {
    const ci = PIPELINE_STEPS.indexOf(currentEstado);
    const si = PIPELINE_STEPS.indexOf(step);
    return ci > si && ci >= 0 && si >= 0;
  }

  stepActive(currentEstado: string, step: string): boolean {
    return currentEstado === step;
  }

  // Clase completa del punto del pipeline (color por token + done/active).
  pDotClass(currentEstado: string, step: string): string {
    let c = 'estd-p-dot ' + this.cfg(step).cls;
    if (this.stepDone(currentEstado, step))   c += ' estd-p-dot--done';
    if (this.stepActive(currentEstado, step)) c += ' estd-p-dot--active';
    return c;
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
    const p = this.perfil();
    if (p?.nombre) {
      return [p.nombre, p.apellido].filter(Boolean).join(' ');
    }
    const u = this.user();
    return u?.user_metadata?.['full_name'] ?? u?.email?.split('@')[0] ?? '';
  }

  servicioNombre(exp: ExpedienteRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  servicioObra(o: ObraResumen): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return o.servicioNombreEn || o.servicioNombre;
    if (lang === 'fr') return o.servicioNombreFr || o.servicioNombre;
    return o.servicioNombre;
  }

  irAEstimar(id: string) { this.router.navigate(['/estimator/file-under-estimation', id]); }
  irAVer(id: string)     { this.router.navigate(['/estimator/estimated-file', id]); }
}
