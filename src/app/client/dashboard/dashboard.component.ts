import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit,
  computed, inject, signal, viewChild,
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
import { SeguimientoService } from '../../services/seguimiento.service';
import { ArchivoRow, ExpedienteCliente, ExpedienteVistaCliente } from '../../models';
import {
  ContratoHistorialItem,
  OfertaHistorialItem,
} from '../../services/expediente.service';

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

interface ContratoClienteInfo {
  id:                   string;
  precio_final:         number;
  garantia_anos:        number | null;
  estado:               string;
  url_pdf:              string | null;
  descripcion_trabajo:  string;
  constructor_nombre:   string;
  constructor_telefono: string | null;
  constructor_email:    string | null;
}

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

// Avance contrato — pasos y porcentajes
const CONTRATO_PASOS = [
  { key: 'generado',     pct: 25,  icon: 'bi-file-earmark-text' },
  { key: 'firmado',      pct: 50,  icon: 'bi-pen'               },
  { key: 'en_ejecucion', pct: 75,  icon: 'bi-tools'             },
  { key: 'completado',   pct: 100, icon: 'bi-house-check'       },
] as const;

const CONTRATO_PCT: Record<string, number> = {
  generado: 25, firmado: 50, en_ejecucion: 75, completado: 100, cancelado: 0,
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
  private matterportIframe = viewChild<ElementRef<HTMLIFrameElement>>('matterportIframe');
  private mediaVideo       = viewChild<ElementRef<HTMLVideoElement>>('mediaVideo');

  private auth               = inject(AuthSupabaseService);
  private expedienteService  = inject(ExpedienteService);
  private archivoService     = inject(ArchivoService);
  private seguimientoService = inject(SeguimientoService);
  private translate          = inject(TranslateService);
  private sanitizer          = inject(DomSanitizer);

  user        = toSignal(this.auth.user$);
  currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  perfil          = signal<{ nombre: string | null; apellido: string | null } | null>(null);
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

  // Historia del expediente activo
  ofertasHistorial  = signal<OfertaHistorialItem[]>([]);
  contratoHistorial = signal<ContratoHistorialItem | null>(null);

  fotosExp         = signal<ArchivoRow[]>([]);
  documentosExp    = signal<ArchivoRow[]>([]);
  contratoCompleto = signal<ContratoClienteInfo | null>(null);
  contratoPdfUrl   = signal<string | null>(null);
  // Seguimiento de obra — avance físico de los trabajos (seguimiento_obra).
  obra             = signal<{ avance: number; estado: string; actualizadoEn: string } | null>(null);
  eliminando       = signal<string | null>(null);

  readonly FASES          = FASES;
  readonly CONTRATO_PASOS = CONTRATO_PASOS;

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

  faseActualPct = computed((): number => {
    const exp = this.expedienteActivo();
    return exp ? Math.round((FASE_MAP[exp.estado] ?? 0) / 5 * 100) : 0;
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

  tieneEstimacion = computed(() => !!this.detalleActivo()?.estimador_nombre);
  tieneContrato   = computed(() => !!this.contratoCompleto());
  todosDocs       = computed(() => [...this.fotosExp(), ...this.documentosExp()]);

  // ── Avance computed ───────────────────────────────────────────────────────

  expCancelado = computed(() => this.expedienteActivo()?.estado === 'cancelado');

  contratoAvancePct = computed((): number => {
    const ct = this.contratoCompleto();
    return ct ? (CONTRATO_PCT[ct.estado] ?? 0) : 0;
  });

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

    const events: TimelineEvento[] = [];

    // ── 1. Expediente creado ──────────────────────────────────────────────
    events.push({ fecha: d.creado_en, tipo: 'creacion', icon: 'bi-folder-plus', titulo: 'timeline.created' });

    // ── 2. Estimador asignado ─────────────────────────────────────────────
    if (d.estimador_nombre) {
      events.push({
        fecha: d.fecha_visita, tipo: 'asignacion', icon: 'bi-person-check',
        titulo: 'timeline.estimator_assigned', subtitulo: d.estimador_nombre,
      });
    }

    // ── 3. Visita / estimación realizada ──────────────────────────────────
    if (d.fecha_visita_real) {
      events.push({
        fecha: d.fecha_visita_real, tipo: 'visita_real',
        icon: 'bi-calendar-check', titulo: 'timeline.visit_done',
      });
    } else if (d.fecha_visita && d.estimador_nombre) {
      events.push({
        fecha: d.fecha_visita, tipo: 'visita_prog',
        icon: 'bi-calendar-check', titulo: 'timeline.visit_scheduled',
      });
    }

    // ── 4. Tour / videos disponibles ─────────────────────────────────────
    if (this.tourUrls().length > 0 || this.videos().length > 0) {
      events.push({
        fecha: d.fecha_visita_real ?? d.fecha_visita, tipo: 'tour',
        icon: 'bi-camera-video', titulo: 'timeline.tour_available',
      });
    }

    // ── 5. Ofertas recibidas (una por oferta) ─────────────────────────────
    const ofertas = this.ofertasHistorial();
    for (let i = 0; i < ofertas.length; i++) {
      events.push({
        fecha: ofertas[i].creado_en,
        tipo:  `oferta_${i}`,
        icon:  'bi-chat-square-quote',
        titulo: 'timeline.offer_received',
        subtitulo: `#${i + 1}`,
      });
    }

    // ── 6. Contrato (oferta aceptada → firmado → ejecución → fin) ────────
    const contrato = this.contratoHistorial();
    if (contrato) {
      events.push({
        fecha: contrato.generado_en, tipo: 'oferta_aceptada',
        icon: 'bi-handshake', titulo: 'timeline.offer_accepted',
      });

      if (contrato.firmado_en) {
        events.push({
          fecha: contrato.firmado_en, tipo: 'contrato_firmado',
          icon: 'bi-pen', titulo: 'timeline.contract_signed',
        });
      }

      if (contrato.oferta?.fecha_inicio) {
        events.push({
          fecha: contrato.oferta.fecha_inicio, tipo: 'inicio_obras',
          icon: 'bi-hammer', titulo: 'timeline.works_started',
        });
      }

      if (contrato.estado === 'en_ejecucion') {
        events.push({
          fecha: contrato.actualizado_en, tipo: 'ejecucion_iniciada',
          icon: 'bi-play-circle', titulo: 'timeline.execution_started',
        });
      }

      if (contrato.estado === 'completado') {
        events.push({
          fecha: contrato.actualizado_en, tipo: 'contrato_completado',
          icon: 'bi-check2-all', titulo: 'timeline.contract_completed',
        });
      }

      if (contrato.estado === 'cancelado') {
        events.push({
          fecha: contrato.actualizado_en, tipo: 'contrato_cancelado',
          icon: 'bi-x-circle', titulo: 'timeline.contract_cancelled',
        });
      }
    }

    return events.sort((a, b) =>
      new Date(b.fecha ?? '').getTime() - new Date(a.fecha ?? '').getTime()
    );
  });

  // ── Calendar ─────────────────────────────────────────────────────────────

  calAnchor    = signal<Date>(new Date());
  calExpandido = signal(false);
  calMes       = signal<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  calMesLabel = computed((): string => {
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.currentLang()] ?? 'fr-CA';
    const ref = this.calExpandido()
      ? new Date(this.calMes().year, this.calMes().month, 1)
      : new Date(this.calAnchor().getFullYear(), this.calAnchor().getMonth(), 1);
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(ref);
  });

  calWeekdays = computed((): string[] => {
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.currentLang()] ?? 'fr-CA';
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2025, 0, 6 + i))
    );
  });

  calDias = computed((): { day: number; inMonth: boolean; isToday: boolean; isAnchor: boolean; eventos: TimelineEvento[] }[] => {
    const anchor  = this.calAnchor();
    const today   = new Date();
    const eventos = this.timelineEventos();

    if (!this.calExpandido()) {
      // Week view: 7 days of the week containing the anchor (Monday-first)
      const dow       = anchor.getDay();
      const mondayOff = (dow + 6) % 7;
      const monday    = new Date(anchor);
      monday.setDate(anchor.getDate() - mondayOff);

      return Array.from({ length: 7 }, (_, i) => {
        const d        = new Date(monday);
        d.setDate(monday.getDate() + i);
        const isToday  = d.toDateString() === today.toDateString();
        const isAnchor = d.toDateString() === anchor.toDateString();
        const dayEvts  = eventos.filter(e => {
          if (!e.fecha) return false;
          const ev = new Date(e.fecha.includes('T') ? e.fecha : `${e.fecha}T00:00:00`);
          return ev.toDateString() === d.toDateString();
        });
        return { day: d.getDate(), inMonth: d.getMonth() === anchor.getMonth(), isToday, isAnchor, eventos: dayEvts };
      });
    }

    // Month view
    const { year, month } = this.calMes();
    const firstWeekday    = new Date(year, month, 1).getDay();
    const offset          = (firstWeekday + 6) % 7;
    const daysInMonth     = new Date(year, month + 1, 0).getDate();
    const daysInPrev      = new Date(year, month, 0).getDate();
    const days: { day: number; inMonth: boolean; isToday: boolean; isAnchor: boolean; eventos: TimelineEvento[] }[] = [];

    for (let i = offset - 1; i >= 0; i--) {
      days.push({ day: daysInPrev - i, inMonth: false, isToday: false, isAnchor: false, eventos: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date     = new Date(year, month, d);
      const isToday  = date.toDateString() === today.toDateString();
      const isAnchor = date.toDateString() === anchor.toDateString();
      const dayEvts  = eventos.filter(e => {
        if (!e.fecha) return false;
        const ev = new Date(e.fecha.includes('T') ? e.fecha : `${e.fecha}T00:00:00`);
        return ev.getFullYear() === year && ev.getMonth() === month && ev.getDate() === d;
      });
      days.push({ day: d, inMonth: true, isToday, isAnchor, eventos: dayEvts });
    }
    const tail = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= tail; d++) {
      days.push({ day: d, inMonth: false, isToday: false, isAnchor: false, eventos: [] });
    }
    return days;
  });

  calPrev(): void {
    if (!this.calExpandido()) {
      const d = new Date(this.calAnchor());
      d.setDate(d.getDate() - 7);
      this.calAnchor.set(d);
    } else {
      const { year, month } = this.calMes();
      this.calMes.set(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
    }
  }

  calNext(): void {
    if (!this.calExpandido()) {
      const d = new Date(this.calAnchor());
      d.setDate(d.getDate() + 7);
      this.calAnchor.set(d);
    } else {
      const { year, month } = this.calMes();
      this.calMes.set(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
    }
  }

  calPrevYear(): void {
    const { year, month } = this.calMes();
    this.calMes.set({ year: year - 1, month });
  }

  calNextYear(): void {
    const { year, month } = this.calMes();
    this.calMes.set({ year: year + 1, month });
  }

  calToggleExpand(): void {
    if (!this.calExpandido()) {
      const a = this.calAnchor();
      this.calMes.set({ year: a.getFullYear(), month: a.getMonth() });
      this.calExpandido.set(true);
    } else {
      this.calExpandido.set(false);
    }
  }

  private calInicializar(): void {
    const eventos = this.timelineEventos();
    if (eventos.length === 0) return;
    const now     = new Date();
    const futuros = eventos
      .filter(e => e.fecha && new Date(e.fecha.includes('T') ? e.fecha : `${e.fecha}T00:00:00`) >= now)
      .sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime());
    const target = futuros.length > 0 ? futuros[0] : eventos[0];
    if (target.fecha) {
      const d = new Date(target.fecha.includes('T') ? target.fecha : `${target.fecha}T00:00:00`);
      this.calAnchor.set(d);
      this.calMes.set({ year: d.getFullYear(), month: d.getMonth() });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  get bienvenida(): string {
    const p = this.perfil();
    if (p?.nombre) {
      return [p.nombre, p.apellido].filter(Boolean).join(' ');
    }
    const u = this.user();
    return u?.user_metadata?.['full_name'] ?? u?.email?.split('@')[0] ?? '';
  }

  expId(exp: ExpedienteCliente): string { return exp.id; }

  progresoPct(exp: ExpedienteCliente): number {
    return Math.round((FASE_MAP[exp.estado] ?? 0) / 5 * 100);
  }

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

  servicioNombreVista(d: ExpedienteVistaCliente): string {
    const lang = this.currentLang();
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  isFaseDone(idx: number): boolean   { return this.faseActual() > idx + 1; }
  isFaseActive(idx: number): boolean { return this.faseActual() === idx + 1; }

  contratoPasoEstado(key: string): 'done' | 'active' | 'pending' {
    const pct     = this.contratoAvancePct();
    const pasoPct = CONTRATO_PCT[key] ?? 0;
    if (pct > pasoPct)          return 'done';
    if (pct === pasoPct && pct > 0) return 'active';
    return 'pending';
  }

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

  formatPrecio(precio: number): string {
    // Use locales where CAD renders as "CA$" or "$CA" — never plain "$" which looks like USD
    const locale = this.translate.currentLang === 'fr' ? 'fr-FR'
                 : this.translate.currentLang === 'en' ? 'en-US'
                 : 'es-CR';
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'CAD',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(precio);
  }

  formatGarantia(anos: number | null): string {
    if (!anos) return '—';
    const lang = this.translate.currentLang;
    if (lang === 'fr') return anos === 1 ? '1 an'  : `${anos} ans`;
    if (lang === 'en') return anos === 1 ? '1 year' : `${anos} years`;
    return anos === 1 ? '1 año' : `${anos} años`;
  }

  contratoEstadoTexto(estado: string): string {
    const map: Record<string, Record<string, string>> = {
      fr: { generado: 'Généré', firmado: 'Signé', en_ejecucion: 'En cours', completado: 'Complété', cancelado: 'Annulé' },
      en: { generado: 'Generated', firmado: 'Signed', en_ejecucion: 'In progress', completado: 'Completed', cancelado: 'Cancelled' },
      es: { generado: 'Generado', firmado: 'Firmado', en_ejecucion: 'En ejecución', completado: 'Completado', cancelado: 'Cancelado' },
    };
    return map[this.translate.currentLang]?.[estado] ?? estado;
  }

  mimeIcon(mime: string): string {
    if (mime.startsWith('image/')) return 'bi-image';
    if (mime.includes('pdf'))      return 'bi-file-earmark-pdf';
    return 'bi-file-earmark';
  }

  docUrl(archivo: ArchivoRow): string {
    return this.archivoService.publicUrl(archivo.url_storage);
  }

  solicitarFullscreen() {
    if (this.activaEsTour()) {
      const el = this.matterportIframe()?.nativeElement as HTMLIFrameElement & { requestFullscreen?: () => void };
      if (el?.requestFullscreen) el.requestFullscreen();
    } else {
      const el = this.mediaVideo()?.nativeElement;
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
      const { data: perfilData } = await this.auth.client
        .from('perfil')
        .select('nombre, apellido')
        .eq('id', userId)
        .single();
      if (perfilData) this.perfil.set(perfilData);

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
    this.fotosExp.set([]);
    this.documentosExp.set([]);
    this.contratoCompleto.set(null);
    this.contratoPdfUrl.set(null);
    this.obra.set(null);
    this.eliminando.set(null);
    this.ofertasHistorial.set([]);
    this.contratoHistorial.set(null);
    this.calExpandido.set(false);
    await this.cargarDetalle(id);
  }

  async eliminarArchivo(archivo: ArchivoRow): Promise<void> {
    this.eliminando.set(archivo.id);
    try {
      await this.archivoService.eliminar(archivo);
      const id = this.idSeleccionado() ?? this.expedienteActivo()?.id;
      if (!id) return;
      const archivos = await this.archivoService.cargarTodos(id);
      this.videos.set(archivos.videos);
      this.fotosExp.set(archivos.fotos);
      this.documentosExp.set(archivos.documentos);
    } catch (e: any) {
      console.error('[Dashboard delete]', e.message);
    } finally {
      this.eliminando.set(null);
    }
  }

  private async cargarDetalle(id: string) {
    this.cargandoDetalle.set(true);
    this.mediaActiva.set(0);

    const [detalleResult, vidsResult, contratoResult] = await Promise.allSettled([
      this.expedienteService.getVistaParaCliente(id),
      this.archivoService.cargarTodos(id),
      this.auth.client
        .from('contrato')
        .select('id, precio_final, garantia_anos, estado, url_pdf, descripcion_trabajo, constructor:constructor_id ( nombre, apellido, telefono, email )')
        .eq('expediente_id', id)
        .maybeSingle() as unknown as Promise<{ data: any; error: any }>,
    ]);

    if (detalleResult.status === 'fulfilled') {
      this.detalleActivo.set(detalleResult.value);
      this.tourUrls.set(EstimacionService.parseUrls(detalleResult.value.url_tour));
    } else {
      console.error('[Dashboard detalle]', (detalleResult.reason as any)?.message);
    }
    if (vidsResult.status === 'fulfilled') {
      this.videos.set(vidsResult.value.videos);
      this.fotosExp.set(vidsResult.value.fotos);
      this.documentosExp.set(vidsResult.value.documentos);
    } else {
      console.error('[Dashboard videos]', (vidsResult.reason as any)?.message);
      this.videos.set([]);
      this.fotosExp.set([]);
      this.documentosExp.set([]);
    }

    if (contratoResult.status === 'fulfilled' && !contratoResult.value.error) {
      const cd = contratoResult.value.data;
      if (cd) {
        this.contratoCompleto.set({
          id:                   cd.id,
          precio_final:         cd.precio_final,
          garantia_anos:        cd.garantia_anos,
          estado:               cd.estado,
          url_pdf:              cd.url_pdf,
          descripcion_trabajo:  cd.descripcion_trabajo,
          constructor_nombre:   cd.constructor
            ? `${cd.constructor.nombre} ${cd.constructor.apellido}`.trim()
            : '—',
          constructor_telefono: cd.constructor?.telefono ?? null,
          constructor_email:    cd.constructor?.email    ?? null,
        });
        if (cd.url_pdf) {
          this.auth.client.storage
            .from('contratos')
            .createSignedUrl(cd.url_pdf, 3600)
            .then(({ data }) => this.contratoPdfUrl.set(data?.signedUrl ?? null))
            .catch(() => {});
        }

        // Seguimiento de obra: avance físico cuando la obra ya arrancó.
        if (cd.estado === 'en_ejecucion' || cd.estado === 'completado') {
          try {
            const seg = await this.seguimientoService.getSeguimientoByContratoId(cd.id);
            this.obra.set(seg ? {
              avance:        cd.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance),
              estado:        cd.estado,
              actualizadoEn: seg.actualizado_en,
            } : null);
          } catch {
            this.obra.set(null);
          }
        } else {
          this.obra.set(null);
        }
      } else {
        this.contratoCompleto.set(null);
        this.obra.set(null);
      }
    } else {
      this.contratoCompleto.set(null);
      this.obra.set(null);
    }

    // Historial: ofertas y contrato del expediente
    try {
      const historial = await this.expedienteService.getHistorialExpediente(id);
      this.ofertasHistorial.set(historial.ofertas);
      this.contratoHistorial.set(historial.contrato);
    } catch {
      this.ofertasHistorial.set([]);
      this.contratoHistorial.set(null);
    }

    this.calInicializar();
    this.cargandoDetalle.set(false);
  }
}
