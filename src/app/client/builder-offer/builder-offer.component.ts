import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService } from '../../services/archivo.service';
import { DocumentosClienteService, ArchivoVM } from '../../services/documentos-cliente.service';
import { OfertaService } from '../../services/oferta.service';
import { ContratoService } from '../../services/contrato.service';
import {
  ArchivoRow,
  EstimacionDetalle,
  ExpedienteDetalleCliente,
  ESTADO_BADGE_OFERTA,
  OfertaConConstructor,
} from '../../models';

@Component({
  selector: 'app-builder-offer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './builder-offer.component.html',
  styleUrl: './builder-offer.component.css',
})
export class BuilderOfferComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private documentosService = inject(DocumentosClienteService);
  private ofertaService     = inject(OfertaService);
  private contratoService   = inject(ContratoService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  user = toSignal(this.auth.user$);

  // ── Datos ──────────────────────────────────────────────────────────────────
  expediente    = signal<ExpedienteDetalleCliente | null>(null);
  estimacion    = signal<EstimacionDetalle | null>(null);
  ofertas       = signal<OfertaConConstructor[]>([]);
  fotosExp      = signal<ArchivoRow[]>([]);
  documentosExp = signal<ArchivoRow[]>([]);
  // "Fotos del sitio" / "Documentos técnicos": solo lo que agregó el ESTIMADOR
  // (no cliente). Resuelto por rol vía el agregador de documentos.
  fotosEstimador      = signal<ArchivoVM[]>([]);
  documentosEstimador = signal<ArchivoVM[]>([]);

  // ── Estado UI ─────────────────────────────────────────────────────────────
  cargando                = signal(true);
  errorMsg                = signal('');
  exitoMsg                = signal('');
  aceptando               = signal(false);
  rechazando              = signal(false);
  confirmandoRechazo      = signal(false);

  // ── Selección de oferta ───────────────────────────────────────────────────
  ofertaSeleccionadaId = signal<string | null>(null);

  // ── Lightbox de fotos ─────────────────────────────────────────────────────
  fotoAmpliada = signal<string | null>(null);

  // ── Video inline — sección oferta (almacena { ofertaId, url }) ───────────
  videoOfertaActiva = signal<{ ofertaId: string; url: string } | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  yaContratado = computed(() => {
    const estado = this.expediente()?.estado;
    return estado === 'adjudicado' || estado === 'contratado';
  });

  puedeAceptar = computed(() => {
    if (!this.ofertaSeleccionadaId() || this.aceptando()) return false;
    if (this.yaContratado()) {
      // En modo "cambiar selección" solo se puede seleccionar una oferta diferente
      return this.ofertaSeleccionada()?.estado !== 'aceptada';
    }
    return true;
  });

  ofertaSeleccionada = computed(() => {
    const id = this.ofertaSeleccionadaId();
    return id ? (this.ofertas().find(o => o.id === id) ?? null) : null;
  });

  private expedienteId = '';

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [exp, estimacion, ofertas, archivos] = await Promise.all([
        this.expedienteService.getDetalleParaCliente(id),
        this.estimacionService.get(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
      ]);

      this.expediente.set(exp);
      this.estimacion.set(estimacion);
      this.ofertas.set(ofertas);
      this.fotosExp.set(archivos.fotos);
      this.documentosExp.set(archivos.documentos);

      // Pre-seleccionar la oferta aceptada si ya existe
      const aceptada = ofertas.find(o => o.estado === 'aceptada');
      if (aceptada) this.ofertaSeleccionadaId.set(aceptada.id);

      // "Fotos del sitio" / "Documentos técnicos": solo lo del estimador.
      await this.cargarArchivosEstimador();

    } catch (e: any) {
      console.error('[BuilderOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Selección de oferta ───────────────────────────────────────────────────

  seleccionar(ofertaId: string) {
    this.ofertaSeleccionadaId.set(ofertaId);
    this.exitoMsg.set('');
    this.errorMsg.set('');
  }

  esSeleccionada(ofertaId: string): boolean {
    return this.ofertaSeleccionadaId() === ofertaId;
  }

  async aceptarOferta() {
    const ofertaId = this.ofertaSeleccionadaId();
    const oferta   = this.ofertaSeleccionada();
    const exp      = this.expediente();
    const userId   = this.user()?.id;
    if (!ofertaId || !oferta || !exp || !userId) return;

    this.aceptando.set(true);
    this.errorMsg.set('');
    this.exitoMsg.set('');

    try {
      // 1 — Capturar ruta del PDF anterior antes de que el RPC elimine el contrato
      const contratoAnterior = await this.contratoService.buscarPorExpediente(this.expedienteId);
      const urlPdfAnterior   = contratoAnterior?.url_pdf ?? null;

      // 2 — Cambiar estado expediente + oferta + reemplazar contrato en DB (via RPC)
      await this.ofertaService.aceptarOferta(this.expedienteId, ofertaId);

      // 3 — Eliminar PDF anterior del storage (best-effort: el flujo no se interrumpe si falla)
      if (urlPdfAnterior) {
        await this.contratoService.eliminarPdfStorage(urlPdfAnterior).catch(() => {});
      }

      // 4 — Obtener el nuevo contrato creado por el RPC
      const contratoRow = await this.contratoService.buscarPorExpediente(this.expedienteId);
      if (!contratoRow) throw new Error('No se pudo obtener el contrato generado.');
      const contratoId = contratoRow.id;

      // 5 — Generar PDF
      const lang = this.translate.currentLang ?? 'fr';
      const fechaGenerado = new Intl.DateTimeFormat(
        lang === 'en' ? 'en-CA' : lang === 'fr' ? 'fr-CA' : 'es-CA',
        { day: 'numeric', month: 'long', year: 'numeric' },
      ).format(new Date());

      const pdfBlob = this.contratoService.generarPdfBlob({
        contratoId,
        expedienteNumero:    exp.numero,
        fechaGenerado,
        clienteNombre:       exp.cliente_nombre,
        constructorNombre:   oferta.constructor_nombre,
        constructorTelefono: oferta.constructor_telefono,
        constructorEmail:    oferta.constructor_email,
        servicioNombre:      this.servicioNombre(),
        servicioDescripcion: this.servicioDescripcion(),
        direccion:           exp.direccion,
        canton:              exp.canton,
        provincia:           exp.provincia,
        distrito:            exp.distrito,
        precioFinal:         oferta.precio,
        plazoMin:            oferta.plazo_semanas_min,
        plazoMax:            oferta.plazo_semanas_max,
        garantiaAnos:        oferta.garantia_anos,
        fechaInicio:         oferta.fecha_inicio,
        descripcionTrabajo:  oferta.descripcion,
        lang,
      });

      // 6 — Subir PDF y guardar ruta en el contrato
      const urlPdf = await this.contratoService.subirPdf(pdfBlob, contratoId);
      await this.contratoService.actualizarUrlPdf(contratoId, urlPdf);

      // 7 — Actualizar estado local sin recargar
      this.expediente.update(e => e ? { ...e, estado: 'adjudicado' } : e);
      this.ofertas.update(list =>
        list.map(o => ({ ...o, estado: o.id === ofertaId ? 'aceptada' : 'rechazada' }))
      );

      this.exitoMsg.set('builder_offer.success_accepted');
    } catch (e: any) {
      console.error('[BuilderOffer] aceptarOferta:', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.aceptando.set(false);
    }
  }

  // ── Rechazo de oferta aceptada ────────────────────────────────────────────

  async rechazarOferta() {
    const ofertaId = this.ofertaSeleccionadaId();
    if (!ofertaId) return;

    this.rechazando.set(true);
    this.errorMsg.set('');
    this.exitoMsg.set('');

    try {
      // 1 — Capturar ruta del PDF antes de que el RPC elimine el contrato
      const contrato = await this.contratoService.buscarPorExpediente(this.expedienteId);
      const urlPdf   = contrato?.url_pdf ?? null;

      // 2 — Rechazar oferta: oferta → rechazada, expediente → estimado, elimina contrato en DB
      await this.contratoService.rechazarOferta(this.expedienteId, ofertaId);

      // 3 — Eliminar PDF del storage (best-effort)
      if (urlPdf) {
        await this.contratoService.eliminarPdfStorage(urlPdf).catch(() => {});
      }

      // 4 — Actualizar estado local sin recargar
      this.expediente.update(e => e ? { ...e, estado: 'estimado' } : e);
      this.ofertas.update(list =>
        list.map(o => o.id === ofertaId ? { ...o, estado: 'rechazada' } : o)
      );
      this.ofertaSeleccionadaId.set(null);
      this.confirmandoRechazo.set(false);
      this.exitoMsg.set('builder_offer.success_rejected');
    } catch (e: any) {
      console.error('[BuilderOffer] rechazarOferta:', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.rechazando.set(false);
    }
  }

  // ── Lightbox de fotos ─────────────────────────────────────────────────────

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  /** Abre el visor con la URL ya resuelta del VM (fotos del estimador). */
  abrirFotoVM(foto: ArchivoVM) {
    this.fotoAmpliada.set(foto.url);
  }

  /** Abre un documento del estimador (URL ya resuelta del VM). */
  verDocumentoVM(doc: ArchivoVM) {
    window.open(doc.url, '_blank', 'noopener');
  }

  cerrarFoto() {
    this.fotoAmpliada.set(null);
  }

  /**
   * Carga lo que agregó el estimador: fotos y documentos (todas las fuentes),
   * resueltos por rol. Una sola consulta.
   */
  private async cargarArchivosEstimador(): Promise<void> {
    const clienteId = this.user()?.id ?? '';
    const numero    = this.expediente()?.numero ?? '';
    try {
      const archivos = await this.documentosService.getArchivosDeExpediente(this.expedienteId, numero, clienteId);
      const delEstimador = archivos.filter(a => a.subidoPorRol === 'estimador');
      this.fotosEstimador.set(delEstimador.filter(a => a.tipo === 'foto'));
      this.documentosEstimador.set(delEstimador.filter(a => a.tipo === 'documento'));
    } catch {
      this.fotosEstimador.set([]);
      this.documentosEstimador.set([]);
    }
  }

  // ── Video inline — oferta ─────────────────────────────────────────────────

  toggleVideoOferta(ofertaId: string, archivo: ArchivoRow) {
    const url    = this.publicUrl(archivo.url_storage);
    const actual = this.videoOfertaActiva();
    if (actual?.ofertaId === ofertaId && actual?.url === url) {
      this.videoOfertaActiva.set(null);
    } else {
      this.videoOfertaActiva.set({ ofertaId, url });
    }
  }

  videoOfertaUrl(ofertaId: string): string | null {
    const a = this.videoOfertaActiva();
    return a?.ofertaId === ofertaId ? a.url : null;
  }

  // ── Archivos generales ────────────────────────────────────────────────────

  publicUrl(path: string): string {
    return this.archivoService.publicUrl(path);
  }

  verDocumento(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  // ── Servicio i18n ─────────────────────────────────────────────────────────

  servicioNombre(): string {
    const e = this.expediente();
    if (!e) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return e.servicio_nombre_en || e.servicio_nombre;
    if (lang === 'fr') return e.servicio_nombre_fr || e.servicio_nombre;
    return e.servicio_nombre;
  }

  servicioDescripcion(): string {
    const e = this.expediente();
    if (!e) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return e.servicio_descripcion_en || e.servicio_descripcion;
    if (lang === 'fr') return e.servicio_descripcion_fr || e.servicio_descripcion;
    return e.servicio_descripcion;
  }

  // ── Tour virtual ──────────────────────────────────────────────────────────

  get urlsTour(): string[] {
    const raw = this.estimacion()?.url_tour ?? null;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch {}
    return [raw];
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // ── Formatters ────────────────────────────────────────────────────────────

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
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

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    const w = this.translate.instant('offer.weeks');
    if (min === max)  return `${min} ${w}`;
    return `${min ?? '?'} – ${max ?? '?'} ${w}`;
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  ofertaBadgeClass(estado: string): string {
    return ESTADO_BADGE_OFERTA[estado] ?? 'bg-secondary';
  }

  ofertaLabel(estado: string): string {
    return 'state.' + estado;
  }

  expedienteBadgeClass(estado: string): string {
    const map: Record<string, string> = {
      'en_oferta':  'bg-primary',
      'adjudicado': 'bg-warning text-dark',
      'contratado': 'bg-success',
      'cancelado':  'bg-secondary',
    };
    return map[estado] ?? 'bg-primary';
  }

  volver() {
    this.router.navigate(['/client/offers-received']);
  }
}
