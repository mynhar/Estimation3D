import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContratoService } from '../../../services/contrato.service';
import { SeguimientoService } from '../../../services/seguimiento.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ArchivoService, ReporteArchivoRow, ReporteMediaTipo } from '../../../services/archivo.service';
import { ContratoAdminDetalle, ContratoPdfData } from '../../../models';
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
  fases       = signal<FaseServicio[]>([]);
  actividades = signal<ActividadServicio[]>([]);

  // ── Formulario: reporte del día ───────────────────────────────────────────
  fechaReporte    = signal(this.fechaISO(new Date()));
  readonly fechaHoy = this.fechaISO(new Date());
  horaInicio      = signal('07:00');
  horasTrabajadas = signal(8);
  avanceDia       = signal(5);
  faseId          = signal<string | null>(null);
  actividadesOn   = signal<Set<string>>(new Set());
  zonaDesc        = signal('');
  zonaPct         = signal<number | null>(null);
  notas           = signal('');

  guardando    = signal(false);
  guardado     = signal(false);
  errorGuardar = signal<string | null>(null);

  // ── Datos de reportes ─────────────────────────────────────────────────────
  reporteHoy          = signal<ReporteDiario | null>(null);
  reportesRecientes   = signal<ReporteDiario[]>([]);
  statsReportes       = signal<StatsReportes>({ total_dias: 0, total_horas: 0 });
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
  nuevaInspTipo    = signal<'inspector' | 'dueno'>('inspector');
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

  readonly PASOS = [
    { key: 'firmado',      icon: 'bi-pen'           },
    { key: 'en_ejecucion', icon: 'bi-tools'         },
    { key: 'completado',   icon: 'bi-check2-circle' },
  ];
  readonly CAL_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // ── Computados ────────────────────────────────────────────────────────────

  avanceGlobal = computed(() => {
    const estado = this.contrato()?.estado;
    if (estado === 'completado') return 100;
    if (estado === 'cancelado')  return 0;
    return this.seguimiento()?.porcentaje_avance ?? 0;
  });

  avancePreview = computed(() => {
    const savedToday = this.reporteHoy()?.porcentaje_avance_dia ?? 0;
    return Math.min(100, this.avanceGlobal() - savedToday + this.avanceDia());
  });

  // Max contribution allowed for the current date: remaining budget excluding today's saved value
  maxAvanceDia = computed(() => {
    const spent = this.avanceGlobal() - (this.reporteHoy()?.porcentaje_avance_dia ?? 0);
    return Math.max(0, 100 - spent);
  });

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

  async ngOnInit() {
    const id     = this.route.snapshot.paramMap.get('id');
    const userId = this.user()?.id;
    if (!id || !userId) {
      this.router.navigate(['/builder/construction-monitoring/list']);
      return;
    }

    try {
      const contrato = await this.contratoService.getContratoMonitoringById(id, userId);
      this.contrato.set(contrato);
      await this.cargarDatosSeguimiento(id, contrato, userId);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() { this.revokeBlobUrl(); }
  private revokeBlobUrl() {
    if (this.rawBlobUrl) { URL.revokeObjectURL(this.rawBlobUrl); this.rawBlobUrl = null; }
  }

  private async cargarDatosSeguimiento(
    contratoId: string,
    contrato: ContratoAdminDetalle,
    userId: string,
  ) {
    let seg = await this.seguimientoService.getSeguimientoByContratoId(contratoId);

    // Backfill if trigger didn't fire (contracts created before migration)
    if (!seg && (contrato.estado === 'firmado' || contrato.estado === 'en_ejecucion')) {
      seg = await this.seguimientoService.ensureSeguimiento(
        contratoId, contrato.expediente_id, userId,
      );
    }

    this.seguimiento.set(seg);
    if (!seg) return;

    const hoy    = new Date();
    const hoyISO = this.fechaISO(hoy);

    const [
      fases, actividades, stats,
      fechasMes, inspeccionesMes, inspProximas, reporteHoy, reportesRecientes,
    ] = await Promise.all([
      seg.servicio_id != null
        ? this.seguimientoService.getFasesByServicioId(seg.servicio_id)
        : Promise.resolve([]),
      seg.servicio_id != null
        ? this.seguimientoService.getActividadesByServicioId(seg.servicio_id)
        : Promise.resolve([]),
      this.seguimientoService.getStatsReportes(seg.id),
      this.seguimientoService.getFechasTrabajadasMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getInspeccionesMes(seg.id, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getProximasInspecciones(seg.id, 3),
      this.seguimientoService.getReporteByFecha(seg.id, hoyISO),
      this.seguimientoService.getReportesRecientes(seg.id, 8),
    ]);

    this.fases.set(fases);
    this.actividades.set(actividades);
    this.statsReportes.set(stats);
    this.fechasTrabajadasMes.set(new Set(fechasMes));
    this.fechasInspeccionMes.set(new Set(inspeccionesMes.map(i => i.fecha)));
    this.inspecciones.set(inspProximas);
    this.reporteHoy.set(reporteHoy);
    this.reportesRecientes.set(reportesRecientes);

    // Load media for today's report if it exists
    if (reporteHoy) await this.cargarMedia(reporteHoy.id);

    // Prefill form with today's saved report
    if (reporteHoy) {
      this.horaInicio.set(reporteHoy.hora_inicio?.substring(0, 5) ?? '07:00');
      this.horasTrabajadas.set(reporteHoy.horas_trabajadas ?? 8);
      this.avanceDia.set(reporteHoy.porcentaje_avance_dia ?? 5);
      this.notas.set(reporteHoy.descripcion ?? '');
      if (reporteHoy.fase_id) this.faseId.set(reporteHoy.fase_id);

      const [actsHoy, zonasHoy] = await Promise.all([
        this.seguimientoService.getActividadesReporte(reporteHoy.id),
        this.seguimientoService.getZonasReporte(reporteHoy.id),
      ]);
      this.actividadesOn.set(new Set(actsHoy.map(a => a.actividad_id)));
      if (zonasHoy.length > 0) {
        this.zonaDesc.set(zonasHoy[0].zona);
        this.zonaPct.set(zonasHoy[0].porcentaje_avance ?? null);
      }
    } else if (seg.fase_actual_id) {
      this.faseId.set(seg.fase_actual_id);
    }
  }

  // ── Navegación ────────────────────────────────────────────────────────────
  volver() { this.router.navigate(['/builder/construction-monitoring/list']); }

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
    const reporte = await this.seguimientoService.getReporteByFecha(seg.id, fecha);
    this.reporteHoy.set(reporte);
    if (reporte) {
      this.horaInicio.set(reporte.hora_inicio?.substring(0, 5) ?? '07:00');
      this.horasTrabajadas.set(reporte.horas_trabajadas ?? 8);
      this.avanceDia.set(reporte.porcentaje_avance_dia ?? 5);
      this.notas.set(reporte.descripcion ?? '');
      if (reporte.fase_id) this.faseId.set(reporte.fase_id);
      const [acts, zonas] = await Promise.all([
        this.seguimientoService.getActividadesReporte(reporte.id),
        this.seguimientoService.getZonasReporte(reporte.id),
      ]);
      this.actividadesOn.set(new Set(acts.map(a => a.actividad_id)));
      this.zonaDesc.set(zonas[0]?.zona ?? '');
      this.zonaPct.set(zonas[0]?.porcentaje_avance ?? null);
      await this.cargarMedia(reporte.id);
    } else {
      this.horaInicio.set('07:00');
      this.horasTrabajadas.set(8);
      this.avanceDia.set(5);
      this.notas.set('');
      this.actividadesOn.set(new Set());
      this.zonaDesc.set('');
      this.zonaPct.set(null);
      this.mediaFotos.set([]);
      this.mediaVideos.set([]);
      this.mediaDocs.set([]);
    }
    this.guardado.set(false);
    this.errorGuardar.set(null);
  }

  setHoraInicio(e: Event)  { this.horaInicio.set((e.target as HTMLInputElement).value); }
  setHorasTrab(e: Event)   { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) this.horasTrabajadas.set(v); }
  setAvanceDia(e: Event)   { const v = parseInt((e.target as HTMLInputElement).value, 10); if (!isNaN(v)) { this.avanceDia.set(Math.min(v, this.maxAvanceDia())); this.guardado.set(false); } }
  setZonaDesc(e: Event)    { this.zonaDesc.set((e.target as HTMLInputElement).value); }
  setZonaPct(e: Event)     { const v = parseFloat((e.target as HTMLInputElement).value); this.zonaPct.set(isNaN(v) ? null : v); }
  setNotas(e: Event)       { this.notas.set((e.target as HTMLTextAreaElement).value); }

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

    this.guardando.set(true);
    this.errorGuardar.set(null);

    try {
      const hoy       = this.fechaReporte();
      const acumulado = this.avancePreview();

      const reporte = await this.seguimientoService.upsertReporte({
        seguimiento_id:        seg.id,
        constructor_id:        userId,
        fecha:                 hoy,
        hora_inicio:           this.horaInicio(),
        horas_trabajadas:      this.horasTrabajadas(),
        porcentaje_avance_dia: this.avanceDia(),
        porcentaje_acumulado:  acumulado,
        fase_id:               this.faseId() ?? undefined,
        descripcion:           this.notas() || null,
      });

      await Promise.all([
        this.seguimientoService.setActividadesReporte(reporte.id, [...this.actividadesOn()]),
        this.zonaDesc()
          ? this.seguimientoService.upsertZona(reporte.id, this.zonaDesc(), null, this.zonaPct())
          : Promise.resolve(),
      ]);

      // Update reporteHoy with the just-saved row — do NOT call cargarDatosSeguimiento
      // because that always reloads for today's date and would overwrite the form.
      // Also sync avanceDia from the DB value: the BEFORE trigger may have clamped it.
      this.reporteHoy.set(reporte);
      this.avanceDia.set(reporte.porcentaje_avance_dia);

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

      await this.cargarMedia(reporte.id);
      this.guardado.set(true);
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
      const localeMap: Record<LangPdf, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
      const locale  = localeMap[lang];
      const fechaGen = c.generado_en
        ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
            .format(new Date(c.generado_en.includes('T') ? c.generado_en : `${c.generado_en}T00:00:00`))
        : '';
      const svcNombre = lang === 'en' ? (c.servicio_nombre_en || c.servicio_nombre)
                      : lang === 'fr' ? (c.servicio_nombre_fr || c.servicio_nombre)
                      : c.servicio_nombre;
      const svcDesc   = lang === 'en' ? (c.servicio_desc_en || c.servicio_desc)
                      : lang === 'fr' ? (c.servicio_desc_fr || c.servicio_desc)
                      : c.servicio_desc;
      const pdfData: ContratoPdfData = {
        contratoId: c.id, expedienteNumero: c.expediente_numero, fechaGenerado: fechaGen,
        clienteNombre: c.cliente_nombre, constructorNombre: c.constructor_nombre,
        constructorTelefono: c.constructor_telefono, constructorEmail: c.constructor_email,
        servicioNombre: svcNombre, servicioDescripcion: svcDesc,
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

  servicioNombre(c: ContratoAdminDetalle): string {
    const lang = this.currentLang();
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

  setNuevaInspTipo(tipo: 'inspector' | 'dueno') { this.nuevaInspTipo.set(tipo); }
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

  seleccionarEvento(r: ReporteDiario): void {
    this.fechaReporte.set(r.fecha);
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
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    return localeMap[this.currentLang() ?? this.translate.currentLang] ?? 'fr-CA';
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
