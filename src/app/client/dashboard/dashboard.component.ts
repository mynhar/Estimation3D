import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit,
  ViewChild, computed, inject, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ArchivoService } from '../../services/archivo.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoRow, ExpedienteCliente, ExpedienteVistaCliente } from '../../models';

// ── 5 visual phases for the progress bar ─────────────────────────────────────

export const FASES = [
  { key: 'nuevo',         icon: 'bi-inbox'            },
  { key: 'en_estimacion', icon: 'bi-search'            },
  { key: 'estimado',      icon: 'bi-clipboard-check'   },
  { key: 'en_oferta',     icon: 'bi-chat-square-quote' },
  { key: 'contratado',    icon: 'bi-check-circle'      },
] as const;

// Maps DB estado to 1-based phase index (adjudicado → 5, cancelado → 0)
const FASE_MAP: Record<string, number> = {
  nuevo:         1,
  en_estimacion: 2,
  estimado:      3,
  en_oferta:     4,
  adjudicado:    5,
  contratado:    5,
  cancelado:     0,
};

// Token-based CSS class per estado
const ESTADO_CLASE: Record<string, string> = {
  nuevo:         'estado-badge--nuevo',
  en_estimacion: 'estado-badge--en-estimacion',
  estimado:      'estado-badge--estimado',
  en_oferta:     'estado-badge--en-oferta',
  adjudicado:    'estado-badge--adjudicado',
  contratado:    'estado-badge--contratado',
  cancelado:     'estado-badge--cancelado',
};

export interface TimelineEvento {
  fecha:      string;
  icon:       string;
  titulo:     string;
  subtitulo?: string;
  tipo:       string;
}

// Priority sort: most urgent states first
function estadoPriority(e: ExpedienteCliente): number {
  const p: Record<string, number> = {
    en_oferta: 0, adjudicado: 1, en_estimacion: 2,
    estimado: 3, nuevo: 4, contratado: 5, cancelado: 6,
  };
  return p[e.estado] ?? 7;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  @ViewChild('matterportIframe') matterportIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('mediaVideo')       mediaVideo?:       ElementRef<HTMLVideoElement>;

  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private archivoService    = inject(ArchivoService);
  private translate         = inject(TranslateService);
  private sanitizer         = inject(DomSanitizer);

  user        = toSignal(this.auth.user$);
  currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  expedientes     = signal<ExpedienteCliente[]>([]);
  cargando        = signal(true);
  idSeleccionado  = signal<string | null>(null);
  detalleActivo   = signal<ExpedienteVistaCliente | null>(null);
  cargandoDetalle = signal(false);
  matterportTip   = signal(false);

  // Media zone — index: 0..tourUrls.length-1 = tours, then videos
  tourUrls    = signal<string[]>([]);
  videos      = signal<ArchivoRow[]>([]);
  mediaActiva = signal<number>(0);

  readonly FASES = FASES;

  // ── KPI computed ──────────────────────────────────────────────────────────

  total       = computed(() => this.expedientes().length);
  enProceso   = computed(() =>
    this.expedientes().filter(e => ['nuevo','en_estimacion','estimado'].includes(e.estado)).length);
  conOfertas  = computed(() =>
    this.expedientes().filter(e => e.estado === 'en_oferta').length);
  completados = computed(() =>
    this.expedientes().filter(e => e.estado === 'contratado').length);

  // ── Active expediente ─────────────────────────────────────────────────────

  expedienteActivo = computed(() =>
    this.expedientes().find(e => this.expId(e) === this.idSeleccionado())
    ?? this.expedientes()[0]
    ?? null
  );

  faseActual = computed((): number => {
    const exp = this.expedienteActivo();
    return exp ? (FASE_MAP[exp.estado] ?? 1) : 0;
  });

  estadoClase = computed((): string => {
    const exp = this.expedienteActivo();
    return exp ? (ESTADO_CLASE[exp.estado] ?? 'estado-badge--nuevo') : 'estado-badge--nuevo';
  });

  matterportUrl = computed((): SafeResourceUrl | null => {
    if (!this.activaEsTour()) return null;
    const url = this.tourUrls()[this.mediaActiva()];
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  // ── Media zone computed ───────────────────────────────────────────────────

  activaEsTour = computed(() => this.mediaActiva() < this.tourUrls().length);
  tieneTour    = computed(() => this.tourUrls().length > 0);
  tieneVideos  = computed(() => this.videos().length > 0);
  tieneMedia   = computed(() => this.tieneTour() || this.tieneVideos());

  videoActivoUrl = computed((): string | null => {
    if (this.activaEsTour()) return null;
    const vidIdx = this.mediaActiva() - this.tourUrls().length;
    const v = this.videos()[vidIdx];
    return v ? this.archivoService.publicUrl(v.url_storage) : null;
  });

  // ── Timeline computed ─────────────────────────────────────────────────────

  timelineEventos = computed((): TimelineEvento[] => {
    const d = this.detalleActivo();
    if (!d) return [];
    const events: TimelineEvento[] = [
      { fecha: d.creado_en, tipo: 'creacion', icon: 'bi-folder-plus', titulo: 'timeline.created' },
    ];
    if (d.estimador_nombre) {
      events.push({
        fecha: d.fecha_visita, tipo: 'asignacion', icon: 'bi-person-check',
        titulo: 'timeline.estimator_assigned', subtitulo: d.estimador_nombre,
      });
    }
    if (d.fecha_visita_real) {
      events.push({ fecha: d.fecha_visita_real, tipo: 'visita', icon: 'bi-camera', titulo: 'timeline.visit_done' });
    } else if (d.fecha_visita && d.estimador_nombre) {
      events.push({ fecha: d.fecha_visita, tipo: 'visita_prog', icon: 'bi-calendar-check', titulo: 'timeline.visit_scheduled' });
    }
    if (this.tourUrls().length > 0 || this.videos().length > 0) {
      events.push({
        fecha: d.fecha_visita_real ?? d.fecha_visita, tipo: 'tour',
        icon: 'bi-camera-video', titulo: 'timeline.tour_available',
      });
    }
    return events.sort((a, b) =>
      new Date(b.fecha ?? '').getTime() - new Date(a.fecha ?? '').getTime()
    );
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  get bienvenida(): string {
    const u = this.user();
    return u?.user_metadata?.['full_name']?.split(' ')[0]
      ?? u?.email?.split('@')[0]
      ?? '';
  }

  expId(exp: ExpedienteCliente): string { return String(exp.id); }

  estadoClaseFor(estado: string): string {
    return ESTADO_CLASE[estado] ?? 'estado-badge--nuevo';
  }

  servicioNombre(s: ExpedienteCliente['servicio']): string {
    if (!s) return '';
    const lang = this.currentLang();
    if (lang === 'en') return s.nombre_en || s.nombre_fr || s.nombre_es || '';
    if (lang === 'es') return s.nombre_es || s.nombre_fr || '';
    return s.nombre_fr || s.nombre_es || '';
  }

  isFaseDone(idx: number): boolean   { return this.faseActual() > idx + 1; }
  isFaseActive(idx: number): boolean { return this.faseActual() === idx + 1; }

  formatFecha(valor: string | null | undefined): string {
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

  seleccionarMedia(idx: number) {
    this.mediaActiva.set(idx);
  }

  solicitarFullscreen() {
    if (this.activaEsTour()) {
      const el = this.matterportIframe?.nativeElement as HTMLIFrameElement & { requestFullscreen?: () => void };
      if (el?.requestFullscreen) el.requestFullscreen();
    } else {
      const el = this.mediaVideo?.nativeElement;
      if (el?.requestFullscreen) el.requestFullscreen();
    }
  }

  dismissMatterportTip() {
    this.matterportTip.set(false);
    localStorage.setItem('matterport_tip_shown', '1');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) return;
    try {
      const exps = await this.expedienteService.getMisExpedientes(userId);
      exps.sort((a, b) => estadoPriority(a) - estadoPriority(b)
        || new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());
      this.expedientes.set(exps);

      if (exps.length > 0) {
        this.idSeleccionado.set(this.expId(exps[0]));
        await this.cargarDetalle(this.expId(exps[0]));
        if (!localStorage.getItem('matterport_tip_shown')) {
          this.matterportTip.set(true);
        }
      }
    } catch (e: any) {
      console.error('[Dashboard]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async seleccionarExpediente(id: string) {
    if (id === this.idSeleccionado()) return;
    this.idSeleccionado.set(id);
    this.detalleActivo.set(null);
    this.tourUrls.set([]);
    this.videos.set([]);
    await this.cargarDetalle(id);
  }

  private async cargarDetalle(id: string) {
    this.cargandoDetalle.set(true);
    this.mediaActiva.set(0);
    const [detalleResult, vidsResult] = await Promise.allSettled([
      this.expedienteService.getVistaParaCliente(id),
      this.archivoService.listarPorExpediente(id),
    ]);
    if (detalleResult.status === 'fulfilled') {
      this.detalleActivo.set(detalleResult.value);
      this.tourUrls.set(EstimacionService.parseUrls(detalleResult.value.url_tour));
    } else {
      console.error('[Dashboard detalle]', (detalleResult.reason as any)?.message);
    }
    if (vidsResult.status === 'fulfilled') {
      this.videos.set(vidsResult.value.videos);
    } else {
      console.error('[Dashboard videos]', (vidsResult.reason as any)?.message);
      this.videos.set([]);
    }
    this.cargandoDetalle.set(false);
  }
}
