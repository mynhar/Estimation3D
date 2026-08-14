import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ExpedienteCliente } from '../../../models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { ClaudeIconComponent } from '../../../shared/ui/claude-icon/claude-icon.component';

// Config por estado. La etiqueta y el mensaje de ayuda son claves i18n
// (`state.<estado>` y `state_hint.<estado>`) que resuelve la plantilla;
// aquí solo viven la clase semántica, el icono y el paso del pipeline.
interface EstadoCfg {
  clase: string;
  icono: string;
  pipelineIdx: number;
}

type Filtro = 'todos' | 'activos' | 'finalizados';
type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-my-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent, ClaudeIconComponent],
  templateUrl: './my-files.component.html',
  styleUrl: './my-files.component.css',
})
export class MyFilesComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);
  private translate         = inject(TranslateService);

  user        = toSignal(this.auth.user$);

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );
  expedientes = signal<ExpedienteCliente[]>([]);
  cargando    = signal(true);

  // ── Filter ─────────────────────────────────────────────────────────────────
  filtro = signal<Filtro>('todos');
  vista  = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  expedientesFiltrados = computed(() => {
    const todos = this.expedientes();
    switch (this.filtro()) {
      case 'activos':     return todos.filter(e => e.estado !== 'cancelado' && e.estado !== 'contratado');
      case 'finalizados': return todos.filter(e => e.estado === 'contratado' || e.estado === 'cancelado');
      default:            return todos;
    }
  });

  // ── Paginación ─────────────────────────────────────────────────────────────
  readonly POR_PAGINA = 9;
  paginaActual = signal(1);

  expedientesPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.expedientesFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  constructor() {
    effect(() => {
      this.filtro();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  // ── Counts ─────────────────────────────────────────────────────────────────
  countTodos      = computed(() => this.expedientes().length);
  countActivos    = computed(() => this.expedientes().filter(e => e.estado !== 'cancelado' && e.estado !== 'contratado').length);
  countFinalizados= computed(() => this.expedientes().filter(e => e.estado === 'contratado' || e.estado === 'cancelado').length);

  // ── Pipeline milestones ────────────────────────────────────────────────────
  readonly PIPELINE = [
    { label: 'pipeline.received' },
    { label: 'pipeline.review'   },
    { label: 'pipeline.offers'   },
    { label: 'pipeline.chosen'   },
    { label: 'pipeline.signed'   },
  ];

  // ── State config ───────────────────────────────────────────────────────────
  private readonly ESTADO_CFG: Record<string, EstadoCfg> = {
    nuevo:         { clase: 'status-badge--nuevo',         icono: 'bi-inbox',              pipelineIdx: 0 },
    en_estimacion: { clase: 'status-badge--en_estimacion', icono: 'bi-clipboard2-pulse',   pipelineIdx: 1 },
    estimado:      { clase: 'status-badge--estimado',      icono: 'bi-check-circle',       pipelineIdx: 1 },
    en_oferta:     { clase: 'status-badge--en_oferta',     icono: 'bi-cash-coin',          pipelineIdx: 2 },
    adjudicado:    { clase: 'status-badge--adjudicado',    icono: 'bi-trophy',             pipelineIdx: 3 },
    contratado:    { clase: 'status-badge--contratado',    icono: 'bi-file-earmark-check', pipelineIdx: 4 },
    cancelado:     { clase: 'status-badge--cancelado',     icono: 'bi-x-circle',           pipelineIdx: -1 },
  };

  private readonly FALLBACK_CFG: EstadoCfg = {
    clase: 'status-badge--cancelado', icono: 'bi-question-circle', pipelineIdx: 0,
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }
    try {
      this.expedientes.set(await this.expedienteService.getMisExpedientes(userId));
    } catch (e: any) {
      console.error('[MyFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Vista tabla / tarjetas ──────────────────────────────────────────────────
  setVista(v: VistaExpedientes): void {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del primer tour 3D Matterport adjunto.
   * Devuelve null si no hay tour Matterport o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteCliente): string | null {
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  estadoCfg(estado: string): EstadoCfg {
    return this.ESTADO_CFG[estado] ?? this.FALLBACK_CFG;
  }

  dotActive(estado: string, stepIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) >= stepIdx;
  }

  dotCurrent(estado: string, stepIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) === stepIdx;
  }

  connectorBlue(estado: string, connectorIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) >= connectorIdx;
  }

  servicioNombre(s: ExpedienteCliente['servicio']): string {
    if (!s) return '—';
    const lang = this.currentLang();
    if (lang === 'en') return s.nombre_en || s.nombre_fr || s.nombre_es || '—';
    if (lang === 'es') return s.nombre_es || s.nombre_fr || '—';
    return s.nombre_fr || s.nombre_es || '—';
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }
}
