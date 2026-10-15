import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContratoService } from '../../../services/contrato.service';
import { SeguimientoService } from '../../../services/seguimiento.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ArchivoService, ReporteArchivoRow, ReporteMediaTipo } from '../../../services/archivo.service';
import { ContratoAdminDetalle, ContratoPdfData, nombreServicio, serviciosParaContrato } from '../../../models';
import {
  ActividadServicio,
  FaseServicio,
  Inspeccion,
  InspeccionInput,
  ReporteDiario,
  SeguimientoObra,
  StatsReportes,
} from '../../../models/seguimiento.model';

type LangPdf = 'es' | 'en' | 'fr';
interface CalDia { num: number; tipo: 'vacio' | 'normal' | 'trabajado' | 'hoy' | 'inspeccion'; }

@Component({
  selector: 'app-construction-monitoring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './monitoring.component.html',
  styleUrl: './monitoring.component.css',
  host: { '(document:keydown.escape)': 'cerrarViewer()' },
})
export class ConstructionMonitoringComponent implements OnInit, OnDestroy {
  private route               = inject(ActivatedRoute);
  private router              = inject(Router);
  private sanitizer           = inject(DomSanitizer);
  private translate           = inject(TranslateService);
  private contratoService     = inject(ContratoService);
  private seguimientoService  = inject(SeguimientoService);
  private auth                = inject(AuthSupabaseService);
  private archivoService      = inject(ArchivoService);
  private user                = toSignal(this.auth.user$);
  currentLang                 = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang },
  );

  // ── Contrato y seguimiento ────────────────────────────────────────────────
  contrato    = signal<ContratoAdminDetalle | null>(null);
  seguimiento = signal<SeguimientoObra | null>(null);
  cargando    = signal(true);
  error       = signal<string | null>(null);

  // ── Catálogos desde BD ────────────────────────────────────────────────────
  // Fases y actividades de TODOS los servicios del contrato. El formulario
  // enseña solo las del servicio elegido (`fasesServicio`, `actividadesServicio`);
  // el historial necesita las de todos para nombrar la fase de cada parte.
  fases       = signal<FaseServicio[]>([]);
  actividades = signal<ActividadServicio[]>([]);

  /**
   * Servicios del contrato, traducidos. Si el contrato no los trae (lista de
   * respaldo con id -1), el principal del expediente vía el seguimiento.
   */
  serviciosObra = computed<{ id: number; nombre: string }[]>(() => {
    const lang  = this.currentLang();
    const lista = (this.contrato()?.servicios ?? [])
      .filter(s => s.id > 0)
      .map(s => ({ id: s.id, nombre: nombreServicio(s, lang) }));
    if (lista.length) return lista;
    const principal = this.seguimiento()?.servicio_id;
    const c = this.contrato();
    return principal != null && c ? [{ id: principal, nombre: this.servicioNombre(c) }] : [];
  });

  /** Con un solo servicio no hay nada que elegir y el formulario queda como antes. */
  multiServicio = computed(() => this.serviciosObra().length > 1);

  fasesServicio = computed(() =>
    this.fases().filter(f => f.servicio_id === this.servicioReporte()));
  actividadesServicio = computed(() =>
    this.actividades().filter(a => a.servicio_id === this.servicioReporte()));

  // ── Formulario: reporte del día ───────────────────────────────────────────
  fechaReporte    = signal(this.fechaISO(new Date()));
  readonly fechaHoy = this.fechaISO(new Date());
  horaInicio      = signal('07:00');
  horasTrabajadas = signal(8);
  avanceDia       = signal(5);
  /** Servicio del contrato en el que se trabajó ese día. */
  servicioReporte = signal<number | null>(null);
  faseId          = signal<string | null>(null);
  actividadesOn   = signal<Set<string>>(new Set());
  zonaDesc        = signal('');
  zonaPct         = signal<number | null>(null);
  notas           = signal('');

  guardando    = signal(false);
  guardado     = signal(false);
  errorGuardar = signal<string | null>(null);

  // ── Datos de reportes ─────────────────────────────────────────────────────
  /**
   * Partes de la fecha elegida: uno por servicio trabajado ese día. El
   * formulario edita el del servicio elegido (`reporteHoy`).
   */
  reportesDelDia      = signal<ReporteDiario[]>([]);
  /** Servicios que ya tienen parte en la fecha elegida. */
  serviciosConParte   = computed(() => new Set(this.reportesDelDia().map(r => r.servicio_id)));
  /** El parte de la fecha y el servicio elegidos, si ya existe. */
  reporteHoy          = signal<ReporteDiario | null>(null);
  /** Evita que una carga lenta pise a otra más reciente al cambiar rápido de servicio o fecha. */
  private cargaParte  = 0;
  reportesRecientes   = signal<ReporteDiario[]>([]);
  statsReportes       = signal<StatsReportes>({ total_dias: 0, total_horas: 0, avance_por_servicio: {}, dias_por_servicio: {} });
  fechasTrabajadasMes = signal<Set<string>>(new Set());
  fechasInspeccionMes = signal<Set<string>>(new Set());
  inspecciones        = signal<Inspeccion[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  calVisible    = signal(false);

  // ── Media (fotos / videos / documentos) ──────────────────────────────────
  mediaFotos   = signal<ReporteArchivoRow[]>([]);
  mediaVideos  = signal<ReporteArchivoRow[]>([]);
  mediaDocs    = signal<ReporteArchivoRow[]>([]);
  subiendoFoto = signal(false);
  subiendoVid  = signal(false);
  subiendoDoc  = signal(false);
  errorMedia          = signal<string | null>(null);
  mediaViewer         = signal<{ tipo: 'foto' | 'video'; url: string; nombre: string } | null>(null);
  eliminandoReporteId = signal<string | null>(null);

  // ── Agenda inline form ────────────────────────────────────────────────────
  eliminandoInspId = signal<string | null>(null);
  agendaVisible    = signal(false);
  nuevaInspTipo    = signal<'inspector' | 'dueno' | 'estimador'>('inspector');
  nuevaInspFecha   = signal('');
  nuevaInspHora    = signal('10:00');
  nuevaInspMotivo  = signal('');
  guardandoInsp    = signal(false);
  errorInsp        = signal<string | null>(null);

  // ── PDF ───────────────────────────────────────────────────────────────────
  pdfVisible   = signal(false);
  pdfGrande    = signal(false);
  generandoPdf = signal(false);
  pdfUrl       = signal<SafeResourceUrl | null>(null);
  langPdf      = signal<LangPdf>('fr');

  readonly LANGS: LangPdf[] = ['es', 'en', 'fr'];
  private rawBlobUrl: string | null = null;

  // ── Realtime ──────────────────────────────────────────────────────────────
  private contratoId = '';
  private channels: RealtimeChannel[] = [];
  private inspTimer: ReturnType<typeof setTimeout> | null = null;
  private ctxTimer: ReturnType<typeof setTimeout> | null = null;
  // Canal de media acotado al parte actualmente cargado (reporteHoy).
  private archivoChannel: RealtimeChannel | null = null;
  private archivoReporteId: string | null = null;

  // Modo administrador: este mismo editor sirve a la ruta admin
  // (/admin/construction-monitoring/monitoring/:id). El admin no está acotado a
  // sus propios contratos y opera sobre el constructor real de la obra.
  esAdmin = false;
  private listaRuta(): string {
    return this.esAdmin
      ? '/admin/construction-monitoring/list'
      : '/builder/construction-monitoring/list';
  }

  readonly PASOS = [
    { key: 'firmado',      icon: 'bi-pen'           },
    { key: 'en_ejecucion', icon: 'bi-tools'         },
    { key: 'completado',   icon: 'bi-check2-circle' },
  ];
  readonly CAL_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // ── Computados ────────────────────────────────────────────────────────────

  /**
   * Avance global de la obra: la media del avance de sus servicios (lo calcula
   * la base, `recalcular_avance_seguimiento`). Llega al 100 % cuando todos los
   * servicios llegan al 100 %.
   */
  avanceGlobal = computed(() => {
    const estado = this.contrato()?.estado;
    if (estado === 'completado') return 100;
    if (estado === 'cancelado')  return 0;
    return Math.round(this.seguimiento()?.porcentaje_avance ?? 0);
  });

  /** Avance guardado de un servicio (0–100). */
  avanceDeServicio(servicioId: number): number {
    return Math.round(this.statsReportes().avance_por_servicio[servicioId] ?? 0);
  }

  /** Avance guardado del servicio del parte, sin contar lo que ya aporta este parte. */
  private avanceServicioSinEste = computed(() => {
    const id = this.servicioReporte();
    if (id == null) return 0;
    const guardado = this.statsReportes().avance_por_servicio[id] ?? 0;
    return Math.max(0, guardado - (this.reporteHoy()?.porcentaje_avance_dia ?? 0));
  });

  /** Avance del servicio del parte tras guardar este día. */
  avancePreview = computed(() =>
    Math.round(Math.min(100, this.avanceServicioSinEste() + this.avanceDia())));

  /** Lo máximo que este parte puede sumar: cada servicio llega como mucho al 100 %. */
  maxAvanceDia = computed(() => Math.max(0, Math.round(100 - this.avanceServicioSinEste())));

  /** Avance global de la obra tras guardar: media de servicios con este ya actualizado. */
  avanceGlobalPreview = computed(() => {
    const servicios = this.serviciosObra();
    if (!servicios.length) return this.avanceGlobal();
    const actual = this.servicioReporte();
    const total  = servicios.reduce((t, s) =>
      t + (s.id === actual ? this.avancePreview() : (this.statsReportes().avance_por_servicio[s.id] ?? 0)), 0);
    return Math.round(Math.min(100, total / servicios.length));
  });

  /** Nombre del servicio del parte (para los textos del formulario). */
  servicioReporteNombre = computed(() =>
    this.serviciosObra().find(s => s.id === this.servicioReporte())?.nombre ?? '');

  diasTrabajados = computed(() => this.statsReportes().total_dias);

  horasTotales = computed(() => {
    const t = this.statsReportes().total_horas;
    return Math.round(t * 10) / 10;
  });

  faseOrdinalActual = computed(() => {
    const id = this.faseId();
    if (!id) return 0;
    return this.fases().find(f => f.id === id)?.orden ?? 0;
  });

  calDias = computed((): CalDia[] => {
    const hoy        = new Date();
    const year       = hoy.getFullYear();
    const month      = hoy.getMonth();
    const first      = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0).getDate();
    const trabajadas = this.fechasTrabajadasMes();
    const inspDates  = this.fechasInspeccionMes();

    const dias: CalDia[] = [];
    const startDow = (first.getDay() + 6) % 7;
    for (let i = 0; i < startDow; i++) dias.push({ num: 0, tipo: 'vacio' });

    for (let d = 1; d <= lastDay; d++) {
      const fecha  = new Date(year, month, d);
      const esHoy  = fecha.toDateString() === hoy.toDateString();
      const iso    = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let tipo: CalDia['tipo'] = 'normal';
      if (esHoy)                    tipo = 'hoy';
      else if (inspDates.has(iso))  tipo = 'inspeccion';
      else if (trabajadas.has(iso)) tipo = 'trabajado';
      dias.push({ num: d, tipo });
    }
    return dias;
  });

  puedeGuardar = computed(() => {
    const e = this.contrato()?.estado;
    return e === 'firmado' || e === 'en_ejecucion';
  });
  cancelado  = computed(() => this.contrato()?.estado === 'cancelado');
  completado = computed(() => this.contrato()?.estado === 'completado');

  /**
   * La obra llegó al 100 % (lo marca la base al recalcular el avance) pero el
   * contrato sigue abierto. El contrato no se completa solo: el 100 % lo
   * declara quien registra los partes, y el administrador lo confirma.
   */
  obraTerminada = computed(() =>
    !this.completado() && !this.cancelado() && this.seguimiento()?.estado === 'completado');

  confirmandoCompletar = signal(false);
  completando          = signal(false);
  errorCompletar       = signal<string | null>(null);

  /** Administrador: completa el contrato desde el seguimiento (mismo RPC que admin/contract/edit). */
  async completarContrato(): Promise<void> {
    const c = this.contrato();
    if (!c || !this.esAdmin || this.completando()) return;
    this.completando.set(true);
    this.errorCompletar.set(null);
    try {
      await this.contratoService.completarContratoAdmin(c.id);
      this.contrato.set(await this.contratoService.getContratoAdminById(c.id));
      this.confirmandoCompletar.set(false);
    } catch (e: any) {
      this.errorCompletar.set(e?.message ?? 'admin_file_edit.save_error');
    } finally {
      this.completando.set(false);
    }
  }

  todayLabel = computed(() => {
    const d = new Date(`${this.fechaReporte()}T00:00:00`);
    return new Intl.DateTimeFormat(this.langLocale(), {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).format(d);
  });

  mesLabel = computed(() => {
    const s = new Intl.DateTimeFormat(this.langLocale(), { month: 'long', year: 'numeric' }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  constructor() {
    // Re-suscribe el canal de media al parte actualmente cargado, para reflejar
    // en vivo las fotos/vídeos/documentos que añade el otro editor (admin↔constructor).
    effect(() => this.sincronizarCanalArchivo(this.reporteHoy()?.id ?? null));
  }

  async ngOnInit() {
    this.esAdmin = this.router.url.includes('/admin/');
    const id     = this.route.snapshot.paramMap.get('id');
    const userId = this.user()?.id;
    if (!id || !userId) {
      this.router.navigate([this.listaRuta()]);
      return;
    }

    this.contratoId = id;
    try {
      const contrato = this.esAdmin
        ? await this.contratoService.getContratoAdminById(id)
        : await this.contratoService.getContratoMonitoringById(id, userId);
      this.contrato.set(contrato);
      await this.cargarDatosSeguimiento(id, contrato, userId);
      this.suscribirRealtime();
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
    this.revokeBlobUrl();
    if (this.inspTimer) clearTimeout(this.inspTimer);
    if (this.ctxTimer) clearTimeout(this.ctxTimer);
    for (const ch of this.channels) this.auth.client.removeChannel(ch);
    this.channels = [];
    if (this.archivoChannel) {
      this.auth.client.removeChannel(this.archivoChannel);
      this.archivoChannel = null;
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  // El constructor es el origen de los partes (refleja sus propias acciones
  // localmente), pero debe ver en vivo lo que cambian otros: el estado del
  // contrato (p. ej. admin marca completado/cancelado) y las inspecciones que
  // agenda el cliente o el estimador. Los refrescos son puntuales para NO pisar
  // el formulario del día en edición.
  private suscribirRealtime(): void {
    this.channels.push(
      this.auth.client
        .channel(`bld-cm-ctr-${this.contratoId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'contrato', filter: `id=eq.${this.contratoId}` },
          () => void this.refrescarEstadoExterno(),
        )
        .subscribe(),
    );

    const segId = this.seguimiento()?.id;
    if (segId) {
      this.channels.push(
        this.auth.client
          .channel(`bld-cm-insp-${segId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'inspeccion', filter: `seguimiento_id=eq.${segId}` },
            () => this.programarRefrescoInspecciones(),
          )
          .subscribe(),
      );

      // Partes diarios de esta obra: el otro editor (admin↔constructor) puede
      // registrar/editar/borrar. Refresca SOLO el contexto (KPIs, registro de
      // eventos, calendario, avance global), nunca el formulario en edición.
      this.channels.push(
        this.auth.client
          .channel(`bld-cm-rep-${segId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'reporte_diario', filter: `seguimiento_id=eq.${segId}` },
            () => this.programarRefrescoContexto(),
          )
          .subscribe(),
      );
    }
  }

  private programarRefrescoContexto(): void {
    if (this.ctxTimer) clearTimeout(this.ctxTimer);
    this.ctxTimer = setTimeout(() => {
      this.ctxTimer = null;
      void this.refrescarContextoReportes();
    }, 500);
  }

  // Refresca el contexto de reportes sin tocar el formulario del día.
  private async refrescarContextoReportes(): Promise<void> {
    const c   = this.contrato();
    const seg = this.seguimiento();
    if (!c || !seg) return;
    const hoy = new Date();
    const [newSeg, stats, fechasMes, recientes] = await Promise.all([
      this.seguimientoService.getSeguimientoByContratoId(c.id),
      this.seguimientoService.getStatsReportes(seg.id),
      this.seguimientoService.getFechasTrabajadasMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getReportesRecientes(seg.id, 8),
    ]);
    if (newSeg) this.seguimiento.set(newSeg);
    this.statsReportes.set(stats);
    this.fechasTrabajadasMes.set(new Set(fechasMes));
    this.reportesRecientes.set(recientes);
  }

  // Canal de media acotado al parte cargado; recarga su media al cambiar.
  private sincronizarCanalArchivo(reporteId: string | null): void {
    if (reporteId === this.archivoReporteId) return;
    this.archivoReporteId = reporteId;
    if (this.archivoChannel) {
      this.auth.client.removeChannel(this.archivoChannel);
      this.archivoChannel = null;
    }
    if (!reporteId) return;
    this.archivoChannel = this.auth.client
      .channel(`bld-cm-arch-${reporteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'archivo', filter: `reporte_id=eq.${reporteId}` },
        () => void this.recargarMediaActual(reporteId),
      )
      .subscribe();
  }

  private async recargarMediaActual(reporteId: string): Promise<void> {
    if (this.reporteHoy()?.id !== reporteId) return;
    await this.cargarMedia(reporteId);
  }

  // Re-lee estado del contrato y avance global sin tocar el formulario.
  private async refrescarEstadoExterno(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId || !this.contratoId) return;
    try {
      const [contrato, seg] = await Promise.all([
        this.esAdmin
          ? this.contratoService.getContratoAdminById(this.contratoId)
          : this.contratoService.getContratoMonitoringById(this.contratoId, userId),
        this.seguimientoService.getSeguimientoByContratoId(this.contratoId),
      ]);
      this.contrato.set(contrato);
      if (seg) this.seguimiento.set(seg);
    } catch { /* silencioso: refresco en segundo plano */ }
  }

  // Agrupa ráfagas y refresca solo la lista/calendario de inspecciones.
  private programarRefrescoInspecciones(): void {
    if (this.inspTimer) clearTimeout(this.inspTimer);
    this.inspTimer = setTimeout(() => {
      this.inspTimer = null;
      void this.refrescarInspecciones();
    }, 500);
  }

  private async refrescarInspecciones(): Promise<void> {
    const seg = this.seguimiento();
    if (!seg) return;
    const hoy = new Date();
    const [proximas, mes] = await Promise.all([
      this.seguimientoService.getProximasInspecciones(seg.id, 3),
      this.seguimientoService.getInspeccionesMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
    ]);
    this.inspecciones.set(proximas);
    this.fechasInspeccionMes.set(new Set(mes.map(i => i.fecha)));
  }
  private revokeBlobUrl() {
    if (this.rawBlobUrl) { URL.revokeObjectURL(this.rawBlobUrl); this.rawBlobUrl = null; }
  }

  private async cargarDatosSeguimiento(
    contratoId: string,
    contrato: ContratoAdminDetalle,
    userId: string,
  ) {
    let seg = await this.seguimientoService.getSeguimientoByContratoId(contratoId);

    // Backfill if trigger didn't fire (contracts created before migration).
    // El seguimiento siempre referencia al constructor real de la obra (no al
    // admin que pudiera estar registrando en su nombre).
    if (!seg && (contrato.estado === 'firmado' || contrato.estado === 'en_ejecucion')) {
      seg = await this.seguimientoService.ensureSeguimiento(
        contratoId, contrato.expediente_id, this.esAdmin ? contrato.constructor_id : userId,
      );
    }

    this.seguimiento.set(seg);
    if (!seg) return;

    const hoy    = new Date();
    const hoyISO = this.fechaISO(hoy);

    // Fases y actividades de todos los servicios del contrato (ya cargado).
    const servicioIds = this.serviciosObra().map(s => s.id);

    const [
      fases, actividades, stats,
      fechasMes, inspeccionesMes, inspProximas, reportesHoy, reportesRecientes,
    ] = await Promise.all([
      servicioIds.length
        ? this.seguimientoService.getFasesByServicioIds(servicioIds)
        : Promise.resolve([]),
      servicioIds.length
        ? this.seguimientoService.getActividadesByServicioIds(servicioIds)
        : Promise.resolve([]),
      this.seguimientoService.getStatsReportes(seg.id),
      this.seguimientoService.getFechasTrabajadasMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getInspeccionesMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getProximasInspecciones(seg.id, 3),
      this.seguimientoService.getReportesDeFecha(seg.id, hoyISO),
      this.seguimientoService.getReportesRecientes(seg.id, 8),
    ]);

    this.fases.set(fases);
    this.actividades.set(actividades);
    this.statsReportes.set(stats);
    this.fechasTrabajadasMes.set(new Set(fechasMes));
    this.fechasInspeccionMes.set(new Set(inspeccionesMes.map(i => i.fecha)));
    this.inspecciones.set(inspProximas);
    this.reportesRecientes.set(reportesRecientes);
    this.reportesDelDia.set(reportesHoy);

    this.servicioReporte.set(this.servicioPorDefecto(seg.fase_actual_id));
    await this.aplicarParteDelServicio();
  }

  /**
   * Pone en el formulario el parte de la fecha y el servicio elegidos, o lo
   * deja en blanco si ese servicio aún no tiene parte ese día. Cada parte
   * tiene su fase, actividades, zona, descripción y archivos.
   */
  private async aplicarParteDelServicio(): Promise<void> {
    const token      = ++this.cargaParte;
    const servicioId = this.servicioReporte();
    const reporte    = this.reportesDelDia().find(r => r.servicio_id === servicioId) ?? null;

    this.reporteHoy.set(reporte);
    this.guardado.set(false);
    this.errorGuardar.set(null);

    if (!reporte) {
      this.horaInicio.set('07:00');
      this.horasTrabajadas.set(8);
      this.avanceDia.set(5);
      this.notas.set('');
      // La fase: la última trabajada, si es de este servicio.
      const faseActual = this.fases().find(f => f.id === this.seguimiento()?.fase_actual_id);
      this.faseId.set(faseActual && faseActual.servicio_id === servicioId ? faseActual.id : null);
      this.actividadesOn.set(new Set());
      this.zonaDesc.set('');
      this.zonaPct.set(null);
      this.mediaFotos.set([]);
      this.mediaVideos.set([]);
      this.mediaDocs.set([]);
      return;
    }

    this.horaInicio.set(reporte.hora_inicio?.substring(0, 5) ?? '07:00');
    this.horasTrabajadas.set(reporte.horas_trabajadas ?? 8);
    this.avanceDia.set(reporte.porcentaje_avance_dia ?? 5);
    this.notas.set(reporte.descripcion ?? '');
    this.faseId.set(reporte.fase_id);

    const [acts, zonas, media] = await Promise.all([
      this.seguimientoService.getActividadesReporte(reporte.id),
      this.seguimientoService.getZonasReporte(reporte.id),
      this.archivoService.cargarPorReporte(reporte.id),
    ]);
    if (token !== this.cargaParte) return;

    this.actividadesOn.set(new Set(acts.map(a => a.actividad_id)));
    this.zonaDesc.set(zonas[0]?.zona ?? '');
    this.zonaPct.set(zonas[0]?.porcentaje_avance ?? null);
    this.mediaFotos.set(media.fotos);
    this.mediaVideos.set(media.videos);
    this.mediaDocs.set(media.documentos);
  }

  /**
   * Servicio con el que arranca una fecha: con un solo servicio, ese; si no,
   * el del último parte de esa fecha, el de la última fase trabajada o el del
   * parte más reciente. Con varios y sin historial queda sin elegir.
   */
  private servicioPorDefecto(faseActualId: string | null): number | null {
    const ids = this.serviciosObra().map(s => s.id);
    if (ids.length === 1) return ids[0];
    const delDia = this.reportesDelDia().at(-1)?.servicio_id;
    if (delDia != null && ids.includes(delDia)) return delDia;
    const deFase = this.fases().find(f => f.id === faseActualId)?.servicio_id;
    if (deFase != null && ids.includes(deFase)) return deFase;
    const reciente = this.reportesRecientes()[0]?.servicio_id;
    if (reciente != null && ids.includes(reciente)) return reciente;
    return null;
  }

  // ── Navegación ────────────────────────────────────────────────────────────
  volver() { this.router.navigate([this.listaRuta()]); }

  // ── Formulario ────────────────────────────────────────────────────────────
  async setFechaReporte(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (!val) return;
    this.fechaReporte.set(val);
    await this.cargarReporteParaFecha(val);
  }

  private async cargarReporteParaFecha(fecha: string): Promise<void> {
    const seg = this.seguimiento();
    if (!seg) return;
    this.reportesDelDia.set(await this.seguimientoService.getReportesDeFecha(seg.id, fecha));
    // Se queda en el servicio elegido; si no hay ninguno, el que toque.
    if (this.servicioReporte() == null) {
      this.servicioReporte.set(this.servicioPorDefecto(seg.fase_actual_id));
    }
    await this.aplicarParteDelServicio();
  }

  setHoraInicio(e: Event)  { this.horaInicio.set((e.target as HTMLInputElement).value); }
  setHorasTrab(e: Event)   { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) this.horasTrabajadas.set(v); }
  setAvanceDia(e: Event)   { const v = parseInt((e.target as HTMLInputElement).value, 10); if (!isNaN(v)) { this.avanceDia.set(Math.min(v, this.maxAvanceDia())); this.guardado.set(false); } }
  setZonaDesc(e: Event)    { this.zonaDesc.set((e.target as HTMLInputElement).value); }
  setZonaPct(e: Event)     { const v = parseFloat((e.target as HTMLInputElement).value); this.zonaPct.set(isNaN(v) ? null : v); }
  setNotas(e: Event)       { this.notas.set((e.target as HTMLTextAreaElement).value); }

  /**
   * Cambia de servicio, es decir, de parte: cada servicio trabajado ese día
   * tiene el suyo. Carga el de ese servicio o deja el formulario en blanco.
   * Lo no guardado del servicio anterior se descarta.
   */
  async setServicio(servicioId: number) {
    if (this.servicioReporte() === servicioId) return;
    this.servicioReporte.set(servicioId);
    await this.aplicarParteDelServicio();
  }

  setFase(faseId: string) {
    this.faseId.set(faseId);
    this.guardado.set(false);
  }

  toggleActividad(actividadId: string) {
    const s = new Set(this.actividadesOn());
    if (s.has(actividadId)) s.delete(actividadId); else s.add(actividadId);
    this.actividadesOn.set(s);
    this.guardado.set(false);
  }

  async guardarReporte() {
    if (this.guardando() || !this.puedeGuardar()) return;
    const seg    = this.seguimiento();
    const userId = this.user()?.id;
    if (!seg || !userId) return;

    // Con varios servicios, el parte tiene que decir en cuál se trabajó.
    if (this.multiServicio() && this.servicioReporte() == null) {
      this.errorGuardar.set('monitoring.servicio_requerido');
      return;
    }
    // Una fase de otro servicio (p. ej. la última trabajada) no se envía.
    const fase = this.fases().find(f => f.id === this.faseId());
    const faseValida = fase && fase.servicio_id === this.servicioReporte() ? fase.id : undefined;

    this.guardando.set(true);
    this.errorGuardar.set(null);

    // El parte que se guarda. Si mientras tanto se abre otro (historial), lo
    // que llega al final no debe pisar el formulario de ese otro parte.
    const fechaGuardada    = this.fechaReporte();
    const servicioGuardado = this.servicioReporte();
    const sigueAbierto = () =>
      this.fechaReporte() === fechaGuardada && this.servicioReporte() === servicioGuardado;

    try {
      const hoy       = fechaGuardada;
      const acumulado = this.avancePreview();

      const reporte = await this.seguimientoService.upsertReporte({
        seguimiento_id:        seg.id,
        constructor_id:        seg.constructor_id,
        fecha:                 hoy,
        hora_inicio:           this.horaInicio(),
        horas_trabajadas:      this.horasTrabajadas(),
        porcentaje_avance_dia: this.avanceDia(),
        porcentaje_acumulado:  acumulado,
        servicio_id:           this.servicioReporte(),
        fase_id:               faseValida,
        descripcion:           this.notas() || null,
      });

      // Solo las actividades del servicio del parte.
      const delServicio = new Set(this.actividadesServicio().map(a => a.id));
      await Promise.all([
        this.seguimientoService.setActividadesReporte(
          reporte.id, [...this.actividadesOn()].filter(id => delServicio.has(id)),
        ),
        this.zonaDesc()
          ? this.seguimientoService.upsertZona(reporte.id, this.zonaDesc(), null, this.zonaPct())
          : Promise.resolve(),
      ]);

      // Primer reporte sobre un contrato firmado → arranca la ejecución de la obra.
      // El RPC es idempotente: si ya está en ejecución no hace nada.
      const contratoActual = this.contrato();
      if (contratoActual?.estado === 'firmado') {
        if (this.esAdmin) await this.contratoService.iniciarEjecucionContratoAdmin(contratoActual.id);
        else              await this.contratoService.iniciarEjecucionContrato(contratoActual.id);
        this.contrato.set({ ...contratoActual, estado: 'en_ejecucion' });
      }

      // Update reporteHoy with the just-saved row — do NOT call cargarDatosSeguimiento
      // because that always reloads for today's date and would overwrite the form.
      // Also sync avanceDia from the DB value: the BEFORE trigger may have clamped it.
      // El parte guardado sustituye al de su servicio en la lista del día.
      if (this.fechaReporte() === fechaGuardada) {
        this.reportesDelDia.update(lista => [
          ...lista.filter(r => r.id !== reporte.id && r.servicio_id !== reporte.servicio_id),
          reporte,
        ]);
      }
      if (sigueAbierto()) {
        this.reporteHoy.set(reporte);
        this.avanceDia.set(Number(reporte.porcentaje_avance_dia));
      }

      // Refresh surrounding context only (KPIs, calendar, event log, global progress).
      const hoyCtx = new Date();
      const [newSeg, stats, fechasMes, recientes] = await Promise.all([
        this.seguimientoService.getSeguimientoByContratoId(this.contrato()!.id),
        this.seguimientoService.getStatsReportes(seg.id),
        this.seguimientoService.getFechasTrabajadasMes(seg.id, hoyCtx.getFullYear(), hoyCtx.getMonth() + 1),
        this.seguimientoService.getReportesRecientes(seg.id, 8),
      ]);
      if (newSeg) this.seguimiento.set(newSeg);
      this.statsReportes.set(stats);
      this.fechasTrabajadasMes.set(new Set(fechasMes));
      this.reportesRecientes.set(recientes);

      if (sigueAbierto()) {
        await this.cargarMedia(reporte.id);
        this.guardado.set(true);
      }
    } catch (e: any) {
      this.errorGuardar.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  pasoActivo(key: string): boolean {
    const ord: Record<string, number> = { firmado: 1, en_ejecucion: 2, completado: 3 };
    const est = this.contrato()?.estado ?? '';
    if (est === 'cancelado') return false;
    return (ord[est] ?? 0) >= (ord[key] ?? 99);
  }
  esPasoActual(key: string): boolean { return this.contrato()?.estado === key; }

  // ── PDF ───────────────────────────────────────────────────────────────────
  async verPdf(lang: LangPdf) {
    const c = this.contrato();
    if (!c) return;
    this.generandoPdf.set(true);
    this.langPdf.set(lang);
    this.pdfVisible.set(true);
    try {
      const localeMap: Record<LangPdf, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
      const locale  = localeMap[lang];
      const fechaGen = c.generado_en
        ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
            .format(new Date(c.generado_en.includes('T') ? c.generado_en : `${c.generado_en}T00:00:00`))
        : '';
      const pdfData: ContratoPdfData = {
        contratoId: c.id, expedienteNumero: c.expediente_numero, fechaGenerado: fechaGen,
        clienteNombre: c.cliente_nombre, constructorNombre: c.constructor_nombre,
        constructorTelefono: c.constructor_telefono, constructorEmail: c.constructor_email,
        // Todos los servicios del contrato, cada uno con su descripción.
        servicios: serviciosParaContrato(c.servicios, lang),
        direccion: c.direccion, canton: c.canton, provincia: c.provincia, distrito: c.distrito ?? '',
        precioFinal: c.precio_final, plazoMin: c.plazo_semanas_min, plazoMax: c.plazo_semanas_max,
        garantiaAnos: c.garantia_anos, fechaInicio: c.oferta_fecha_inicio ?? '',
        descripcionTrabajo: c.descripcion_trabajo, lang,
      };
      const blob = this.contratoService.generarPdfBlob(pdfData);
      this.revokeBlobUrl();
      this.rawBlobUrl = URL.createObjectURL(blob);
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.rawBlobUrl));
    } finally {
      this.generandoPdf.set(false);
    }
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  faseName(fase: FaseServicio): string {
    const lang = this.currentLang();
    if (lang === 'en') return fase.nombre_en;
    if (lang === 'fr') return fase.nombre_fr;
    return fase.nombre_es;
  }

  actividadName(act: ActividadServicio): string {
    const lang = this.currentLang();
    if (lang === 'en') return act.nombre_en;
    if (lang === 'fr') return act.nombre_fr;
    return act.nombre_es;
  }

  /** Todos los servicios del contrato; si no vienen, el principal como antes. */
  servicioNombre(c: ContratoAdminDetalle): string {
    const lang = this.currentLang();
    if (c.servicios?.length) {
      return c.servicios.map(s => nombreServicio(s, lang)).join(' · ');
    }
    if (lang === 'en') return c.servicio_nombre_en || c.servicio_nombre;
    if (lang === 'fr') return c.servicio_nombre_fr || c.servicio_nombre;
    return c.servicio_nombre;
  }

  badgeExpediente(estado: string): string {
    return ({
      en_ejecucion: 'badge-exp-ejecucion',
      completado:   'badge-exp-completado',
      adjudicado:   'badge-exp-adjudicado',
      contratado:   'badge-exp-contratado',
    } as Record<string, string>)[estado] ?? '';
  }

  inspDia(fecha: string): string {
    const raw = fecha.includes('T') ? fecha.split('T')[0] : fecha;
    return new Date(`${raw}T00:00:00`).getDate().toString();
  }

  inspMes(fecha: string): string {
    const raw = fecha.includes('T') ? fecha.split('T')[0] : fecha;
    return new Intl.DateTimeFormat(this.langLocale(), { month: 'short' })
      .format(new Date(`${raw}T00:00:00`))
      .toUpperCase()
      .replace('.', '');
  }

  async eliminarInspeccion(insp: Inspeccion): Promise<void> {
    const seg = this.seguimiento();
    if (!seg) return;

    this.eliminandoInspId.set(insp.id);
    try {
      await this.seguimientoService.deleteInspeccion(insp.id);
      const hoy = new Date();
      const [proximas, mes] = await Promise.all([
        this.seguimientoService.getProximasInspecciones(seg.id, 3),
        this.seguimientoService.getInspeccionesMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      ]);
      this.inspecciones.set(proximas);
      this.fechasInspeccionMes.set(new Set(mes.map(i => i.fecha)));
    } catch (e: any) {
      this.errorInsp.set(e.message);
    } finally {
      this.eliminandoInspId.set(null);
    }
  }

  agendarInspeccion() {
    this.agendaVisible.set(!this.agendaVisible());
    this.errorInsp.set(null);
  }

  cancelarAgenda() {
    this.agendaVisible.set(false);
    this.errorInsp.set(null);
  }

  setNuevaInspTipo(tipo: 'inspector' | 'dueno' | 'estimador') { this.nuevaInspTipo.set(tipo); }
  setNuevaInspFecha(e: Event) { this.nuevaInspFecha.set((e.target as HTMLInputElement).value); }
  setNuevaInspHora(e: Event)  { this.nuevaInspHora.set((e.target as HTMLInputElement).value); }
  setNuevaInspMotivo(e: Event){ this.nuevaInspMotivo.set((e.target as HTMLInputElement).value); }

  async guardarInspeccion() {
    if (!this.nuevaInspFecha() || !this.nuevaInspHora()) {
      this.errorInsp.set('monitoring.error_campos');
      return;
    }
    const seg    = this.seguimiento();
    const userId = this.user()?.id;
    if (!seg || !userId) return;

    this.guardandoInsp.set(true);
    this.errorInsp.set(null);
    try {
      const input: InspeccionInput = {
        seguimiento_id: seg.id,
        tipo_visitante: this.nuevaInspTipo(),
        fecha:          this.nuevaInspFecha(),
        hora:           this.nuevaInspHora(),
        motivo:         this.nuevaInspMotivo() || null,
        creado_por:     userId,
      };
      await this.seguimientoService.insertInspeccion(input);

      // Reset form and reload
      this.nuevaInspFecha.set('');
      this.nuevaInspHora.set('10:00');
      this.nuevaInspMotivo.set('');
      this.nuevaInspTipo.set('inspector');
      this.agendaVisible.set(false);

      const hoy = new Date();
      const [proximas, mes] = await Promise.all([
        this.seguimientoService.getProximasInspecciones(seg.id, 3),
        this.seguimientoService.getInspeccionesMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      ]);
      this.inspecciones.set(proximas);
      this.fechasInspeccionMes.set(new Set(mes.map(i => i.fecha)));
    } catch (e: any) {
      this.errorInsp.set(e.message);
    } finally {
      this.guardandoInsp.set(false);
    }
  }

  /** Nombre del servicio de un parte, para el historial (solo con varios). */
  servicioNombreById(servicioId: number | null): string {
    if (servicioId == null) return '';
    return this.serviciosObra().find(s => s.id === servicioId)?.nombre ?? '';
  }

  faseNameById(faseId: string | null): string {
    if (!faseId) return '';
    const fase = this.fases().find(f => f.id === faseId);
    if (!fase) return '';
    const lang = this.currentLang();
    if (lang === 'en') return fase.nombre_en;
    if (lang === 'fr') return fase.nombre_fr;
    return fase.nombre_es;
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  // ── Flujo de eventos: seleccionar / eliminar ──────────────────────────────

  /** Abre un parte del historial: su fecha y su servicio. */
  seleccionarEvento(r: ReporteDiario): void {
    this.fechaReporte.set(r.fecha);
    if (r.servicio_id != null) this.servicioReporte.set(r.servicio_id);
    this.cargarReporteParaFecha(r.fecha);
  }

  async eliminarEvento(r: ReporteDiario): Promise<void> {
    const seg    = this.seguimiento();
    const userId = this.user()?.id;
    if (!seg || !userId) return;

    this.eliminandoReporteId.set(r.id);
    try {
      await this.archivoService.eliminarPorReporte(r.id);
      await this.seguimientoService.deleteReporte(r.id);
      await this.seguimientoService.recalcularAvanceSeguimiento(seg.id);
      const c = this.contrato()!;
      await this.cargarDatosSeguimiento(c.id, c, userId);
    } catch (e: any) {
      this.errorGuardar.set(e.message);
    } finally {
      this.eliminandoReporteId.set(null);
    }
  }

  abrirMedia(archivo: ReporteArchivoRow): void {
    const url = this.publicUrl(archivo.url_storage);
    if (archivo.tipo === 'reporte_foto') {
      this.mediaViewer.set({ tipo: 'foto', url, nombre: archivo.nombre_archivo });
    } else if (archivo.tipo === 'reporte_video') {
      this.mediaViewer.set({ tipo: 'video', url, nombre: archivo.nombre_archivo });
    } else {
      window.open(url, '_blank');
    }
  }

  cerrarViewer(): void { this.mediaViewer.set(null); }

  private async cargarMedia(reporteId: string): Promise<void> {
    const { fotos, videos, documentos } = await this.archivoService.cargarPorReporte(reporteId);
    this.mediaFotos.set(fotos);
    this.mediaVideos.set(videos);
    this.mediaDocs.set(documentos);
  }

  async subirMedia(event: Event, tipo: ReporteMediaTipo): Promise<void> {
    const files  = (event.target as HTMLInputElement).files;
    if (!files?.length) return;
    const reporte = this.reporteHoy();
    const seg     = this.seguimiento();
    const userId  = this.user()?.id;
    if (!reporte || !seg || !userId) return;

    const busy = tipo === 'reporte_foto' ? this.subiendoFoto
               : tipo === 'reporte_video' ? this.subiendoVid
               : this.subiendoDoc;

    busy.set(true);
    this.errorMedia.set(null);
    try {
      for (const file of Array.from(files)) {
        await this.archivoService.subirParaReporte(seg.id, reporte.id, tipo, file, userId);
      }
      await this.cargarMedia(reporte.id);
    } catch (e: any) {
      this.errorMedia.set(e.message);
    } finally {
      busy.set(false);
      (event.target as HTMLInputElement).value = '';
    }
  }

  async eliminarMedia(archivo: ReporteArchivoRow): Promise<void> {
    const reporte = this.reporteHoy();
    try {
      await this.archivoService.eliminar(archivo);
      if (reporte) await this.cargarMedia(reporte.id);
    } catch (e: any) {
      this.errorMedia.set(e.message);
    }
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  badgeContrato(estado: string): string {
    return ({
      firmado:      'badge-firmado',
      en_ejecucion: 'badge-en-ejecucion',
      completado:   'badge-completado',
      cancelado:    'badge-cancelado',
    } as Record<string, string>)[estado] ?? '';
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(this.langLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  formatPrecio(precio: number | null): string {
    if (precio == null) return '—';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(precio);
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    if (min === max) return `${min} sem.`;
    return `${min ?? '?'} – ${max ?? '?'} sem.`;
  }

  private langLocale(): string {
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    return localeMap[this.currentLang() ?? this.translate.currentLang] ?? 'fr-CA';
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
