import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FILE_LIMITS, validateFile } from '../../../shared/validators/file.validator';
import { ExpedienteService } from '../../../services/expediente.service';
import { ArchivoService } from '../../../services/archivo.service';
import { OfertaService } from '../../../services/oferta.service';
import { ContratoService } from '../../../services/contrato.service';
import { PerfilRepository, PerfilNombre } from '../../../data/perfil.repository';
import { ContratoPdfData, ExpedienteParaOferta, ArchivoRow, OfertaForm, OfertaConConstructor } from '../../../models';

@Component({
  selector: 'app-admin-offer-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, DecimalPipe],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminOfferEditComponent implements OnInit {
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private archivoService    = inject(ArchivoService);
  private ofertaService     = inject(OfertaService);
  private contratoService   = inject(ContratoService);
  private perfilRepo        = inject(PerfilRepository);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  detalle  = signal<ExpedienteParaOferta | null>(null);
  cargando = signal(true);
  errorMsg = signal('');

  fotos      = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  constructores             = signal<PerfilNombre[]>([]);
  constructorSeleccionadoId = signal<string>('');

  precio: number | null       = null;
  /** Por defecto 1 semana: es el plazo mínimo razonable y evita el campo vacío. */
  plazoMin: number | null     = 1;
  plazoMax: number | null     = null;
  garantiaAnos: number | null = null;
  fechaInicio                 = '';
  descripcion                 = '';

  // Documentos: varios por oferta. `documentosOferta` son los pendientes de
  // subir; `documentosActuales`, los ya guardados. El vídeo sigue siendo único.
  documentosOferta   = signal<File[]>([]);
  documentosActuales = signal<ArchivoRow[]>([]);
  videoOferta        = signal<File | null>(null);
  videoActual        = signal<ArchivoRow | null>(null);

  dragDocs      = signal(false);
  eliminandoDoc = signal<string | null>(null);

  ofertaId  = signal<string | null>(null);
  enviada   = signal(false);
  enviando  = signal(false);
  exitoMsg  = signal('');
  errorEnvio = signal('');

  eliminando          = signal(false);
  errorEliminar       = signal('');
  confirmandoEliminar   = signal(false);
  confirmandoEliminarId = signal<string | null>(null);
  errorEliminarLista    = signal('');

  adjudicando            = signal(false);
  errorAdjudicar         = signal('');
  confirmandoAdjudicarId = signal<string | null>(null);

  fotoAmpliada = signal<string | null>(null);
  tabMedia     = signal<'fotos' | 'tour' | 'docs'>('tour');

  todasLasOfertas = signal<OfertaConConstructor[]>([]);
  private expedienteId = '';

  get completedSteps(): number {
    let n = 0;
    if (this.constructorSeleccionadoId()) n++;
    if (this.precio && this.precio > 0) n++;
    if (this.plazoMin && this.plazoMin > 0 && this.plazoMax && this.plazoMax >= (this.plazoMin ?? 0)) n++;
    if (this.fechaInicio) n++;
    if (this.descripcion.trim()) n++;
    if (this.documentosActuales().length || this.documentosOferta().length) n++;
    return n;
  }

  // ── Validez por campo ──────────────────────────────────────────────────────
  // Mismos criterios que las guardas de enviarOferta(), para que el borde rojo
  // y el error al guardar no puedan contradecirse.
  get constructorInvalido(): boolean { return !this.constructorSeleccionadoId(); }
  get precioInvalido():      boolean { return !this.precio   || this.precio   <= 0; }
  get plazoMinInvalido():    boolean { return !this.plazoMin || this.plazoMin <= 0; }
  get plazoMaxInvalido():    boolean {
    return !this.plazoMax || this.plazoMax < (this.plazoMin ?? 1);
  }
  get fechaInicioInvalida(): boolean { return !this.fechaInicio; }
  get descripcionInvalida(): boolean { return !this.descripcion.trim(); }
  /** El documento sólo es obligatorio al crear la oferta. */
  get documentoInvalido():   boolean {
    return !this.ofertaId() && this.documentosOferta().length === 0;
  }

  get formularioCompleto(): boolean {
    const esNueva = !this.ofertaId();
    return !!(
      this.constructorSeleccionadoId() &&
      this.precio && this.precio > 0 &&
      this.plazoMin && this.plazoMin > 0 &&
      this.plazoMax && this.plazoMax >= (this.plazoMin ?? 0) &&
      this.fechaInicio &&
      this.descripcion.trim() &&
      (!esNueva || this.documentosOferta().length > 0)
    );
  }

  get puedeEliminar(): boolean {
    if (!this.ofertaId()) return false;
    const estado = this.detalle()?.estado ?? '';
    return estado !== 'contratado';
  }

  get puedeEliminarOfertas(): boolean {
    const estado = this.detalle()?.estado ?? '';
    return estado !== 'contratado';
  }

  get puedeAdjudicar(): boolean {
    const estado = this.detalle()?.estado ?? '';
    return estado === 'en_oferta' || estado === 'adjudicado';
  }

  get constructorSeleccionadoNombre(): string {
    const id = this.constructorSeleccionadoId();
    const c  = this.constructores().find(p => p.id === id);
    return c ? `${c.nombre} ${c.apellido}`.trim() : '';
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [detalle, archivosExpediente, constructoresList, ofertas] = await Promise.all([
        this.expedienteService.getExpedienteParaOferta(id),
        this.archivoService.listarPorExpediente(id),
        this.perfilRepo.findActivosByRoles(['constructor']),
        this.ofertaService.getOfertasDeExpediente(id),
      ]);

      this.detalle.set(detalle);
      this.fotos.set(archivosExpediente.fotos);
      this.documentos.set(archivosExpediente.documentos);

      // Los constructores con oferta existente se conservan como opción aunque
      // hoy estén inactivos u otro rol, para no perder las ofertas guardadas.
      let lista = constructoresList;
      const faltantes = [...new Set(ofertas.map(o => o.constructor_id))]
        .filter(cid => !lista.some(c => c.id === cid));
      if (faltantes.length) {
        const extras = await this.perfilRepo.findByIds(faltantes);
        lista = [...extras, ...lista];
      }
      this.constructores.set(lista);
      this.todasLasOfertas.set(ofertas);

      const ofertaAceptada = ofertas.find(o => o.estado === 'aceptada');
      const ofertaPrimaria = ofertaAceptada ?? (ofertas.length ? ofertas[0] : null);
      if (ofertaPrimaria) {
        this.constructorSeleccionadoId.set(ofertaPrimaria.constructor_id);
        this.popularFormulario(ofertaPrimaria);
      }
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  private popularFormulario(oferta: OfertaConConstructor) {
    this.ofertaId.set(oferta.id);
    this.precio       = oferta.precio;
    this.plazoMin     = oferta.plazo_semanas_min;
    this.plazoMax     = oferta.plazo_semanas_max;
    this.garantiaAnos = oferta.garantia_anos;
    this.fechaInicio  = oferta.fecha_inicio;
    this.descripcion  = oferta.descripcion;
    this.documentosActuales.set(oferta.documentos ?? []);
    this.videoActual.set(oferta.videos?.length ? oferta.videos[0] : null);
    this.documentosOferta.set([]);
    this.videoOferta.set(null);
    this.exitoMsg.set('');
    this.errorEnvio.set('');
  }

  private limpiarFormulario() {
    this.ofertaId.set(null);
    this.precio       = null;
    this.plazoMin     = 1;   // vuelve al valor por defecto, no a vacío
    this.plazoMax     = null;
    this.garantiaAnos = null;
    this.fechaInicio  = '';
    this.descripcion  = '';
    this.documentosActuales.set([]);
    this.videoActual.set(null);
    this.documentosOferta.set([]);
    this.videoOferta.set(null);
    this.exitoMsg.set('');
    this.errorEnvio.set('');
  }

  onConstructorChange(constructorId: string) {
    this.constructorSeleccionadoId.set(constructorId);
    if (!constructorId) { this.limpiarFormulario(); return; }
    const oferta = this.todasLasOfertas().find(o => o.constructor_id === constructorId);
    if (oferta) {
      this.popularFormulario(oferta);
    } else {
      this.limpiarFormulario();
    }
  }

  onDocumentos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.encolarDocumentos(files);
  }

  // ── Arrastrar y soltar documentos ──────────────────────────────────────────
  onDragOverDocs(e: DragEvent) { e.preventDefault(); this.dragDocs.set(true); }
  onDragLeaveDocs()            { this.dragDocs.set(false); }
  onDropDocs(e: DragEvent) {
    e.preventDefault();
    this.dragDocs.set(false);
    this.encolarDocumentos(Array.from(e.dataTransfer?.files ?? []));
  }

  /**
   * El `accept` del input no filtra lo que se suelta, así que el tipo se valida
   * aquí para ambos caminos. Este campo admite sólo PDF.
   */
  private validarDocumento(file: File): string | null {
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!esPdf)                                       return 'validation.file_type';
    if (file.size > FILE_LIMITS.DOCUMENTO.maxBytes)   return 'validation.file_size';
    return null;
  }

  private encolarDocumentos(files: File[]) {
    if (!files.length) return;
    this.errorEnvio.set('');
    for (const file of files) {
      const err = this.validarDocumento(file);
      if (err) { this.errorEnvio.set(err); return; }
    }
    this.documentosOferta.update(lista => [...lista, ...files]);
  }

  quitarDocumentoPendiente(indice: number) {
    this.documentosOferta.update(lista => lista.filter((_, i) => i !== indice));
  }

  async eliminarDocumentoGuardado(archivo: ArchivoRow) {
    if (this.eliminandoDoc()) return;
    this.eliminandoDoc.set(archivo.id);
    this.errorEnvio.set('');
    try {
      await this.archivoService.eliminar(archivo);
      this.documentosActuales.update(lista => lista.filter(a => a.id !== archivo.id));
    } catch (e: any) {
      this.errorEnvio.set(e.message);
    } finally {
      this.eliminandoDoc.set(null);
    }
  }

  onVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    input.value = '';
    if (!file) { this.videoOferta.set(null); return; }
    const err = validateFile(file, FILE_LIMITS.VIDEO.maxBytes, FILE_LIMITS.VIDEO.types);
    if (err) { this.errorEnvio.set(err); return; }
    this.videoOferta.set(file);
  }

  async enviarOferta() {
    this.errorEnvio.set('');
    this.exitoMsg.set('');

    const constructorId = this.constructorSeleccionadoId();
    if (!constructorId) { this.errorEnvio.set('admin_offer.err_constructor'); return; }
    if (!this.precio || this.precio <= 0) { this.errorEnvio.set('make_offer.err_price'); return; }
    if (!this.plazoMin || this.plazoMin <= 0) { this.errorEnvio.set('make_offer.err_plazo_min'); return; }
    if (!this.plazoMax || this.plazoMax < this.plazoMin) { this.errorEnvio.set('make_offer.err_plazo_max'); return; }
    if (!this.fechaInicio) { this.errorEnvio.set('make_offer.err_date'); return; }
    if (!this.descripcion.trim()) { this.errorEnvio.set('make_offer.err_desc'); return; }

    const esNueva = !this.ofertaId();
    const docs    = this.documentosOferta();
    if (esNueva && !docs.length) { this.errorEnvio.set('make_offer.err_doc'); return; }

    const form: OfertaForm = {
      precio:            this.precio,
      plazo_semanas_min: this.plazoMin,
      plazo_semanas_max: this.plazoMax,
      garantia_anos:     this.garantiaAnos,
      fecha_inicio:      this.fechaInicio,
      descripcion:       this.descripcion.trim(),
    };

    this.enviando.set(true);
    try {
      if (esNueva) {
        await this.ofertaService.enviar(
          this.expedienteId, constructorId, form, docs, this.videoOferta(),
        );
        this.enviada.set(true);
        this.exitoMsg.set('make_offer.success_sent');
        this.todasLasOfertas.set(await this.ofertaService.getOfertasDeExpediente(this.expedienteId));
        const newOffer = this.todasLasOfertas().find(o => o.constructor_id === constructorId);
        if (newOffer) {
          this.ofertaId.set(newOffer.id);
          await this.refrescarArchivos(newOffer.id);
        }
      } else {
        await this.ofertaService.actualizar(
          this.ofertaId()!, constructorId, form, this.videoOferta(),
        );
        if (docs.length) {
          await this.ofertaService.agregarDocumentos(this.ofertaId()!, constructorId, docs);
        }
        if (docs.length || this.videoOferta()) {
          await this.refrescarArchivos(this.ofertaId()!);
        }
        this.exitoMsg.set('make_offer.success_updated');
      }
    } catch (e: any) {
      this.errorEnvio.set(e.message);
    } finally {
      this.enviando.set(false);
    }
  }

  private async refrescarArchivos(ofertaId: string) {
    const archivos = await this.archivoService.cargarPorOferta(ofertaId);
    this.documentosActuales.set(archivos.documentos);
    this.videoActual.set(archivos.videos[0] ?? null);
    this.documentosOferta.set([]);
    this.videoOferta.set(null);
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  servicioDescripcion(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_descripcion_en || d.servicio_descripcion;
    if (lang === 'fr') return d.servicio_descripcion_fr || d.servicio_descripcion;
    return d.servicio_descripcion;
  }

  get urlsTour(): string[] {
    const raw = this.detalle()?.url_tour ?? null;
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

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() {
    this.fotoAmpliada.set(null);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
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

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  async eliminarOferta() {
    if (!this.ofertaId() || !this.puedeEliminar) return;
    if (!this.confirmandoEliminar()) {
      this.confirmandoEliminar.set(true);
      return;
    }
    this.eliminando.set(true);
    this.errorEliminar.set('');
    try {
      await this.ofertaService.eliminarOferta(this.ofertaId()!, this.expedienteId);
      this.router.navigate(['/admin/offer']);
    } catch (e: any) {
      this.errorEliminar.set(e.message);
      this.confirmandoEliminar.set(false);
    } finally {
      this.eliminando.set(false);
    }
  }

  cancelarEliminar() {
    this.confirmandoEliminar.set(false);
    this.errorEliminar.set('');
  }

  async adjudicarOferta(oferta: OfertaConConstructor) {
    if (this.adjudicando()) return;
    this.adjudicando.set(true);
    this.errorAdjudicar.set('');
    this.confirmandoAdjudicarId.set(null);
    try {
      // Capturar url_pdf del contrato anterior antes de que el RPC lo elimine
      const contratoAnterior = await this.contratoService.buscarPorExpediente(this.expedienteId);
      const urlPdfAnterior   = contratoAnterior?.url_pdf ?? null;

      // RPC: adjudica oferta + crea nuevo contrato en DB
      await this.ofertaService.aceptarOferta(this.expedienteId, oferta.id);

      // Refrescar estado de la UI y obtener el nuevo contrato en paralelo
      const [ofertas, detalle, nuevoContrato] = await Promise.all([
        this.ofertaService.getOfertasDeExpediente(this.expedienteId),
        this.expedienteService.getExpedienteParaOferta(this.expedienteId),
        this.contratoService.buscarPorExpediente(this.expedienteId),
      ]);
      this.todasLasOfertas.set(ofertas);
      this.detalle.set(detalle);

      // Generar y guardar PDF
      if (nuevoContrato) {
        if (urlPdfAnterior) {
          await this.contratoService.eliminarPdfStorage(urlPdfAnterior);
        }
        const d    = this.detalle()!;
        const lang = this.translate.currentLang;
        const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
        const locale      = localeMap[lang] ?? 'fr-CA';
        const fechaHoy    = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
        const pdfData: ContratoPdfData = {
          contratoId:          nuevoContrato.id,
          expedienteNumero:    d.numero,
          fechaGenerado:       fechaHoy,
          clienteNombre:       d.cliente_nombre,
          constructorNombre:   oferta.constructor_nombre,
          constructorTelefono: oferta.constructor_telefono,
          constructorEmail:    oferta.constructor_email,
          servicioNombre:      this.servicioNombre(),
          servicioDescripcion: this.servicioDescripcion(),
          direccion:           d.direccion,
          canton:              d.canton,
          provincia:           d.provincia,
          distrito:            d.distrito,
          precioFinal:         oferta.precio,
          plazoMin:            oferta.plazo_semanas_min,
          plazoMax:            oferta.plazo_semanas_max,
          garantiaAnos:        oferta.garantia_anos,
          fechaInicio:         oferta.fecha_inicio,
          descripcionTrabajo:  oferta.descripcion,
          lang,
        };
        const pdfBlob = this.contratoService.generarPdfBlob(pdfData);
        const pdfPath = await this.contratoService.subirPdf(pdfBlob, nuevoContrato.id);
        await this.contratoService.actualizarUrlPdf(nuevoContrato.id, pdfPath);
      }
    } catch (e: any) {
      this.errorAdjudicar.set(e.message);
    } finally {
      this.adjudicando.set(false);
    }
  }

  cancelarAdjudicar() {
    this.confirmandoAdjudicarId.set(null);
    this.errorAdjudicar.set('');
  }

  nuevaOferta() {
    this.limpiarFormulario();
    this.constructorSeleccionadoId.set('');
    this.confirmandoEliminar.set(false);
    this.confirmandoEliminarId.set(null);
    this.errorEliminar.set('');
    this.errorEliminarLista.set('');
  }

  seleccionarOferta(oferta: OfertaConConstructor) {
    this.constructorSeleccionadoId.set(oferta.constructor_id);
    this.popularFormulario(oferta);
    this.confirmandoEliminar.set(false);
    this.confirmandoEliminarId.set(null);
    this.errorEliminar.set('');
    this.errorEliminarLista.set('');
  }

  async eliminarOfertaLista(oferta: OfertaConConstructor) {
    if (this.eliminando()) return;
    this.eliminando.set(true);
    this.errorEliminarLista.set('');
    try {
      await this.ofertaService.eliminarOferta(oferta.id, this.expedienteId);
      this.todasLasOfertas.set(
        await this.ofertaService.getOfertasDeExpediente(this.expedienteId),
      );
      if (oferta.id === this.ofertaId()) {
        this.limpiarFormulario();
        this.constructorSeleccionadoId.set('');
        const first = this.todasLasOfertas()[0];
        if (first) {
          this.constructorSeleccionadoId.set(first.constructor_id);
          this.popularFormulario(first);
        }
      }
      this.confirmandoEliminarId.set(null);
    } catch (e: any) {
      this.errorEliminarLista.set(e.message);
      this.confirmandoEliminarId.set(null);
    } finally {
      this.eliminando.set(false);
    }
  }

  estadoOfertaKey(estado: string): string {
    return `admin_offer.oferta_${estado}`;
  }

  initiales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  }

  volver() {
    this.router.navigate(['/admin/offer']);
  }
}
