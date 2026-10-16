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
  descripcionServicio,
  nombreServicio,
  serviciosDeOferta,
  serviciosParaContrato,
} from '../../models';
import { ServicioCompleto } from '../../data/servicio.repository';

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
  /** Todos los servicios del expediente (principal primero), con su descripción. */
  servicios     = signal<ServicioCompleto[]>([]);
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

  // ── Selección de ofertas ──────────────────────────────────────────────────
  // Varias a la vez: una para todos los servicios, una para cada servicio o
  // varias para el mismo. Al aceptar, un contrato por oferta (adjudicar_ofertas).
  seleccion = signal<ReadonlySet<string>>(new Set());

  // ── Lightbox de fotos ─────────────────────────────────────────────────────
  fotoAmpliada = signal<string | null>(null);

  // ── Video inline — sección oferta (almacena { ofertaId, url }) ───────────
  videoOfertaActiva = signal<{ ofertaId: string; url: string } | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  yaContratado = computed(() => {
    const estado = this.expediente()?.estado;
    return estado === 'adjudicado' || estado === 'contratado';
  });

  /**
   * Con contratos firmados la selección ya no se puede cambiar (la base lo
   * impide: adjudicar_ofertas solo acepta 'en_oferta' / 'adjudicado').
   */
  bloqueado = computed(() => this.expediente()?.estado === 'contratado');

  /** El expediente tiene varios servicios: cada oferta dice cuáles cubre. */
  multiServicio = computed(() => this.servicios().length > 1);

  ofertasSeleccionadas = computed(() =>
    this.ofertas().filter(o => this.seleccion().has(o.id)));

  /** Suma del precio de todas las ofertas seleccionadas. */
  totalSeleccion = computed(() =>
    this.ofertasSeleccionadas().reduce((s, o) => s + Number(o.precio ?? 0), 0));

  private aceptadasIds = computed(() =>
    new Set(this.ofertas().filter(o => o.estado === 'aceptada').map(o => o.id)));

  /** La selección difiere de lo ya aceptado (hay algo que guardar). */
  seleccionCambiada = computed(() => {
    const sel = this.seleccion(), acc = this.aceptadasIds();
    return sel.size !== acc.size || [...sel].some(id => !acc.has(id));
  });

  /** Para cada servicio del expediente, las ofertas seleccionadas que lo cubren. */
  cobertura = computed(() =>
    this.servicios().map(s => ({
      servicio: s,
      ofertas:  this.ofertasSeleccionadas().filter(o => this.cubre(o, s.id)),
    })));

  puedeAceptar = computed(() =>
    !this.aceptando() && !this.bloqueado()
    && this.seleccion().size > 0 && this.seleccionCambiada());

  private expedienteId = '';

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [exp, estimacion, ofertas, archivos, servicios] = await Promise.all([
        this.expedienteService.getDetalleParaCliente(id),
        this.estimacionService.get(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
        // Si falla, la ficha enseña solo el servicio principal, como antes.
        this.expedienteService.getServiciosCompletos(id).catch((e: any) => {
          console.error('[BuilderOffer] servicios:', e?.message);
          return [] as ServicioCompleto[];
        }),
      ]);

      this.expediente.set(exp);
      this.servicios.set(servicios);
      this.estimacion.set(estimacion);
      this.ofertas.set(ofertas);
      this.fotosExp.set(archivos.fotos);
      this.documentosExp.set(archivos.documentos);

      // Pre-seleccionar las ofertas ya aceptadas
      this.seleccion.set(new Set(ofertas.filter(o => o.estado === 'aceptada').map(o => o.id)));

      // "Fotos del sitio" / "Documentos técnicos": solo lo del estimador.
      await this.cargarArchivosEstimador();

    } catch (e: any) {
      console.error('[BuilderOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Selección de ofertas ──────────────────────────────────────────────────

  /** Marca o desmarca una oferta. Con contratos firmados no cambia nada. */
  seleccionar(ofertaId: string) {
    if (this.bloqueado() || this.aceptando()) return;
    this.seleccion.update(sel => {
      const next = new Set(sel);
      if (next.has(ofertaId)) next.delete(ofertaId); else next.add(ofertaId);
      return next;
    });
    this.exitoMsg.set('');
    this.errorMsg.set('');
    this.confirmandoRechazo.set(false);
  }

  esSeleccionada(ofertaId: string): boolean {
    return this.seleccion().has(ofertaId);
  }

  /** Una oferta sin servicios (no debería existir) cubre el expediente entero. */
  cubre(oferta: OfertaConConstructor, servicioId: number): boolean {
    const ids = oferta.servicio_ids ?? [];
    return !ids.length || ids.includes(servicioId);
  }

  /** Nombres de los servicios que cubre la oferta, en el orden del expediente. */
  serviciosDeOfertaTexto(oferta: OfertaConConstructor): string {
    return serviciosDeOferta(this.servicios(), oferta).map(s => this.nombreDe(s)).join(' · ');
  }

  /**
   * Acepta la selección: un contrato por oferta, en una sola transacción
   * (adjudicar_ofertas); las ofertas no seleccionadas quedan rechazadas y los
   * contratos sin firmar anteriores se sustituyen. Después, un PDF por contrato
   * con los servicios de SU oferta. Mismo flujo que administración.
   *
   * Un fallo generando un PDF no deshace la aceptación: los contratos ya están
   * en la base. Se avisa de cuántos PDF salieron.
   */
  async aceptarSeleccion() {
    const ids = [...this.seleccion()];
    const exp = this.expediente();
    if (!ids.length || !exp || !this.puedeAceptar()) return;

    this.aceptando.set(true);
    this.errorMsg.set('');
    this.exitoMsg.set('');

    try {
      // Rutas de los PDF que el RPC va a sustituir: después ya no hay fila de
      // la que leerlas y quedarían huérfanas en el bucket.
      const pdfsAnteriores = (await this.contratoService.listarPorExpediente(this.expedienteId))
        .map(c => c.url_pdf)
        .filter((u): u is string => !!u);

      const creados = await this.contratoService.adjudicarOfertas(this.expedienteId, ids);

      for (const url of pdfsAnteriores) {
        await this.contratoService.eliminarPdfStorage(url).catch(() => {});
      }

      const lang  = this.translate.currentLang ?? 'fr';
      const fecha = new Intl.DateTimeFormat(
        lang === 'en' ? 'en-CA' : lang === 'fr' ? 'fr-CA' : 'es-CA',
        { day: 'numeric', month: 'long', year: 'numeric' },
      ).format(new Date());

      let fallidos = 0;
      for (const { id_contrato, id_oferta } of creados) {
        const oferta = this.ofertas().find(o => o.id === id_oferta);
        if (!oferta) { fallidos++; continue; }
        try {
          await this.generarPdfContrato(id_contrato, oferta, exp, lang, fecha);
        } catch {
          fallidos++;
        }
      }

      // Estado local sin recargar
      const sel = new Set(ids);
      this.expediente.update(e => e ? { ...e, estado: 'adjudicado' } : e);
      this.ofertas.update(list =>
        list.map(o => o.eliminada_en ? o : { ...o, estado: sel.has(o.id) ? 'aceptada' : 'rechazada' }));

      this.exitoMsg.set(fallidos
        ? this.translate.instant('builder_offer.pdf_partial', { n: creados.length - fallidos, total: creados.length })
        : this.translate.instant(creados.length === 1 ? 'builder_offer.success_accepted' : 'builder_offer.success_accepted_n',
                                 { n: creados.length }));
    } catch (e: any) {
      console.error('[BuilderOffer] aceptarSeleccion:', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.aceptando.set(false);
    }
  }

  /** PDF de un contrato: los servicios de SU oferta, no los del expediente. */
  private async generarPdfContrato(
    contratoId: string, oferta: OfertaConConstructor, exp: ExpedienteDetalleCliente, lang: string, fecha: string,
  ): Promise<void> {
    const pdfBlob = this.contratoService.generarPdfBlob({
      contratoId,
      expedienteNumero:    exp.numero,
      fechaGenerado:       fecha,
      clienteNombre:       exp.cliente_nombre,
      constructorNombre:   oferta.constructor_nombre,
      constructorTelefono: oferta.constructor_telefono,
      constructorEmail:    oferta.constructor_email,
      // Sin lista de servicios (fallo de carga), la forma antigua: el principal.
      servicios:           this.servicios().length
                             ? serviciosParaContrato(serviciosDeOferta(this.servicios(), oferta), lang)
                             : undefined,
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
    const urlPdf = await this.contratoService.subirPdf(pdfBlob, contratoId);
    await this.contratoService.actualizarUrlPdf(contratoId, urlPdf);
  }

  // ── Rechazo de las ofertas aceptadas ──────────────────────────────────────

  /**
   * Con la selección vacía, rechaza todas las aceptadas: sus contratos sin
   * firmar se eliminan y el expediente vuelve a 'estimado' (la base solo lo
   * hace cuando ya no queda ninguna aceptada).
   */
  async rechazarAceptadas() {
    const aceptadas = [...this.aceptadasIds()];
    if (!aceptadas.length || this.bloqueado()) return;

    this.rechazando.set(true);
    this.errorMsg.set('');
    this.exitoMsg.set('');

    try {
      // Rutas de los PDF antes de que el RPC elimine los contratos
      const contratos = await this.contratoService.listarPorExpediente(this.expedienteId);

      for (const ofertaId of aceptadas) {
        await this.contratoService.rechazarOferta(this.expedienteId, ofertaId);
        const url = contratos.find(c => c.oferta_id === ofertaId)?.url_pdf;
        if (url) await this.contratoService.eliminarPdfStorage(url).catch(() => {});
      }

      this.expediente.update(e => e ? { ...e, estado: 'estimado' } : e);
      this.ofertas.update(list =>
        list.map(o => aceptadas.includes(o.id) ? { ...o, estado: 'rechazada' } : o));
      this.seleccion.set(new Set());
      this.confirmandoRechazo.set(false);
      this.exitoMsg.set(aceptadas.length === 1 ? 'builder_offer.success_rejected' : 'builder_offer.success_rejected_n');
    } catch (e: any) {
      console.error('[BuilderOffer] rechazarAceptadas:', e.message);
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

  nombreDe(s: ServicioCompleto): string {
    return nombreServicio(s, this.translate.currentLang);
  }

  descripcionDe(s: ServicioCompleto): string {
    return descripcionServicio(s, this.translate.currentLang);
  }

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
