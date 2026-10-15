import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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
import {
  ContratoPdfData, ExpedienteParaOferta, ArchivoRow, OfertaForm, OfertaConConstructor, ServicioPdf,
  nombreServicio, serviciosParaContrato, serviciosDeOferta,
} from '../../../models';
import { ServicioCompleto } from '../../../data/servicio.repository';
import { OfertaRepartoComponent, alternarEnSeleccion } from '../../../shared/ui/oferta-reparto/oferta-reparto.component';
import {
  ServicioOpcion, ServicioSelectorComponent, resumirServicios,
} from '../../../shared/ui/servicio-selector/servicio-selector.component';

@Component({
  selector: 'app-admin-offer-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, DecimalPipe, OfertaRepartoComponent, ServicioSelectorComponent],
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
  /** Todos los servicios del expediente, el principal primero. */
  servicios = signal<ServicioCompleto[]>([]);

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  /**
   * Con un solo servicio no hay nada que elegir: la oferta lo cubre y la
   * pantalla se queda como estaba. Todo lo de «a qué servicios» y la suma de
   * ofertas solo aparece con dos o más.
   */
  multiServicio = computed(() => this.servicios().length > 1);

  opcionesServicio = computed<ServicioOpcion[]>(() => {
    const lang = this.currentLang();
    return this.servicios().map(s => ({
      id:          s.id,
      codigo:      s.codigo ?? '',
      nombre:      nombreServicio(s, lang),
      descripcion: '',
    }));
  });

  /** Servicios que cubre la oferta del formulario (alta o edición). */
  servicioIdsOferta = signal<number[]>([]);
  /** Se intentó guardar: el selector de servicios muestra su error. */
  intentado = signal(false);
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
  /** Fallo al leer «Ofertas recibidas»; se muestra dentro de esa columna. */
  errorOfertas          = signal('');

  adjudicando            = signal(false);
  errorAdjudicar         = signal('');
  exitoAdjudicar         = signal('');
  confirmandoAdjudicarId = signal<string | null>(null);

  restaurando    = signal<string | null>(null);
  errorRestaurar = signal('');

  // ── Reparto en bloque ──────────────────────────────────────────────────────
  // La barra, las acciones y la confirmación viven en <app-oferta-reparto>,
  // compartido con admin/file/builder-bids. Aquí queda sólo lo que la tarjeta
  // necesita: el conjunto marcado y su alternador.
  //
  // Ojo con la palabra «seleccionar»: aquí hay dos. Pulsar la tarjeta abre la
  // oferta en el formulario de la derecha (eso es `ofertaId`); la casilla marca
  // la oferta para el reparto (esto). Son independientes a propósito.
  seleccion = signal<ReadonlySet<string>>(new Set());

  /**
   * Cuándo se pinta la casilla. Más amplio que el bloqueo de la barra a
   * propósito: en 'adjudicado' las tres acciones de estado están vetadas (la
   * base las rechaza con un contrato vivo), pero re-adjudicar SÍ se permite, y
   * sin casillas no habría forma de elegir a quién.
   */
  get puedeSeleccionar(): boolean {
    const estado = this.detalle()?.estado ?? '';
    return estado === 'en_oferta' || estado === 'adjudicado';
  }

  estaSeleccionada(oferta: OfertaConConstructor): boolean {
    return this.seleccion().has(oferta.id);
  }

  alternarSeleccion(oferta: OfertaConConstructor): void {
    this.seleccion.update(actual => alternarEnSeleccion(actual, oferta.id));
  }

  limpiarSeleccion(): void {
    this.seleccion.set(new Set());
    this.confirmandoAdjudicarSeleccion.set(false);
  }

  /**
   * Las marcadas que se pueden adjudicar. Una oferta dada de baja no entra
   * aunque la casilla se hubiera quedado marcada de antes.
   */
  seleccionadasParaAdjudicar = computed(() =>
    this.ofertasActivas().filter(o => this.seleccion().has(o.id)));

  // ── Suma de ofertas (solo con varios servicios) ────────────────────────────
  // Cada oferta tiene un único precio para los servicios que cubre. Con varios
  // servicios el cliente puede acabar contratando varias ofertas, así que se
  // enseña lo que suman: todas las vivas y, si hay marcadas, las marcadas.

  sumaOfertas = computed(() =>
    this.ofertasActivas().reduce((total, o) => total + (o.precio ?? 0), 0));

  sumaSeleccionadas = computed(() =>
    this.seleccionadasParaAdjudicar().reduce((total, o) => total + (o.precio ?? 0), 0));

  /** Servicios del expediente que ninguna oferta marcada cubre. */
  serviciosSinCubrir = computed(() => {
    const marcadas = this.seleccionadasParaAdjudicar();
    if (!marcadas.length) return [];
    const cubiertos = new Set(
      marcadas.flatMap(o => serviciosDeOferta(this.opcionesServicio(), o).map(s => s.id)),
    );
    return this.opcionesServicio().filter(s => !cubiertos.has(s.id)).map(s => s.nombre);
  });

  confirmandoAdjudicarSeleccion = signal(false);

  /**
   * El RPC sólo adjudica desde 'en_oferta' o 'adjudicado', así que el botón se
   * bloquea antes de llegar a la base.
   */
  get puedeAdjudicarSeleccion(): boolean {
    const estado = this.detalle()?.estado ?? '';
    return (estado === 'en_oferta' || estado === 'adjudicado')
      && this.seleccionadasParaAdjudicar().length > 0;
  }

  /** El reparto se aplicó en la base: releer y refrescar el formulario. */
  async onRepartoAplicado(): Promise<void> {
    await this.recargarOfertas();
    this.detalle.set(await this.expedienteService.getExpedienteParaOferta(this.expedienteId));
    // El formulario abierto puede estar mostrando un estado ya caducado.
    const abierta = this.todasLasOfertas().find(o => o.id === this.ofertaId());
    if (abierta) this.popularFormulario(abierta);
  }

  fotoAmpliada = signal<string | null>(null);
  tabMedia     = signal<'fotos' | 'tour' | 'docs'>('tour');

  todasLasOfertas = signal<OfertaConConstructor[]>([]);
  /**
   * Las dadas de baja siguen en la lista —ese es el requisito— pero no cuentan
   * para el tope de 5 ni para el selector de constructor.
   */
  ofertasActivas = computed(() => this.todasLasOfertas().filter(o => !o.eliminada_en));
  /** Lo lee la plantilla para pasárselo a <app-oferta-reparto>. */
  expedienteId = '';

  esEliminada(oferta: OfertaConConstructor): boolean {
    return !!oferta.eliminada_en;
  }

  get completedSteps(): number {
    let n = 0;
    if (this.constructorSeleccionadoId()) n++;
    if (this.multiServicio() && this.servicioIdsOferta().length) n++;
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

  /** Con varios servicios, la oferta tiene que decir a cuáles se presenta. */
  get serviciosOfertaInvalidos(): boolean {
    return this.multiServicio() && this.servicioIdsOferta().length === 0;
  }

  get formularioCompleto(): boolean {
    const esNueva = !this.ofertaId();
    return !!(
      this.constructorSeleccionadoId() &&
      !this.serviciosOfertaInvalidos &&
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

    // `allSettled` y no `all`: «Ofertas recibidas» tiene que salir siempre. Con
    // `all`, un fallo en cualquiera de las otras tres cargas (fotos del
    // expediente, lista de constructores) abortaba el bloque entero, `detalle`
    // se quedaba en null y la plantilla pintaba «expediente no encontrado»,
    // ocultando ofertas que sí existían. Sólo el expediente es fatal: sin él no
    // hay página que pintar; lo demás degrada y deja la columna en pie.
    const [detalleRes, archivosRes, constructoresRes, ofertasRes, serviciosRes] = await Promise.allSettled([
      this.expedienteService.getExpedienteParaOferta(id),
      this.archivoService.listarPorExpediente(id),
      this.perfilRepo.findActivosByRoles(['constructor']),
      this.ofertaService.getOfertasDeExpediente(id, true),
      this.expedienteService.getServiciosCompletos(id),
    ]);

    try {
      if (detalleRes.status === 'rejected') {
        this.errorMsg.set(detalleRes.reason?.message ?? 'file.not_found');
        return;
      }
      this.detalle.set(detalleRes.value);

      // Sin la lista, el resumen cae al servicio principal de `detalle`.
      if (serviciosRes.status === 'fulfilled') {
        this.servicios.set(serviciosRes.value);
      } else {
        console.error('[AdminOfferEdit] servicios:', serviciosRes.reason?.message ?? serviciosRes.reason);
      }

      if (archivosRes.status === 'fulfilled') {
        this.fotos.set(archivosRes.value.fotos);
        this.documentos.set(archivosRes.value.documentos);
      }

      const ofertas = ofertasRes.status === 'fulfilled'
        ? this.ordenarOfertas(ofertasRes.value)
        : [];
      if (ofertasRes.status === 'rejected') {
        this.errorOfertas.set(ofertasRes.reason?.message ?? 'common.error');
      }
      this.todasLasOfertas.set(ofertas);

      // Los constructores con oferta existente se conservan como opción aunque
      // hoy estén inactivos u otro rol, para no perder las ofertas guardadas.
      let lista = constructoresRes.status === 'fulfilled' ? constructoresRes.value : [];
      const faltantes = [...new Set(ofertas.map(o => o.constructor_id))]
        .filter(cid => !lista.some(c => c.id === cid));
      if (faltantes.length) {
        try {
          const extras = await this.perfilRepo.findByIds(faltantes);
          lista = [...extras, ...lista];
        } catch { /* sin nombres extra: la oferta se sigue listando */ }
      }
      this.constructores.set(lista);

      // El formulario sólo edita ofertas vivas: una dada de baja se ve en la
      // lista pero no se carga para editar.
      const vivas          = ofertas.filter(o => !o.eliminada_en);
      const ofertaAceptada = vivas.find(o => o.estado === 'aceptada');
      const ofertaPrimaria = ofertaAceptada ?? (vivas.length ? vivas[0] : null);
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

  /**
   * El repositorio ordena por precio ascendente, útil para comparar. Encima de
   * eso se agrupa por estado —aceptada, pendiente, rechazada— para que se vea
   * de un vistazo en qué punto está cada oferta y las descartadas no se
   * intercalen entre las vivas. Dentro de cada grupo se respeta el precio.
   */
  private ordenarOfertas(ofertas: OfertaConConstructor[]): OfertaConConstructor[] {
    const peso: Record<string, number> = { aceptada: 0, pendiente: 1, rechazada: 2 };
    // Las dadas de baja bajan al final en bloque: siguen visibles, pero no se
    // mezclan con las vivas que el administrador está comparando.
    const rango = (o: OfertaConConstructor) =>
      (o.eliminada_en ? 10 : 0) + (peso[o.estado] ?? 3);
    return [...ofertas].sort((a, b) => rango(a) - rango(b));
  }

  /** Relee las ofertas del expediente conservando el orden por estado. */
  private async recargarOfertas(): Promise<OfertaConConstructor[]> {
    const ofertas = this.ordenarOfertas(
      await this.ofertaService.getOfertasDeExpediente(this.expedienteId, true),
    );
    this.todasLasOfertas.set(ofertas);
    return ofertas;
  }

  private popularFormulario(oferta: OfertaConConstructor) {
    this.ofertaId.set(oferta.id);
    this.servicioIdsOferta.set(oferta.servicio_ids ?? []);
    this.intentado.set(false);
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
    // Una oferta nueva empieza sin servicios: hay que decir a cuáles se presenta.
    this.servicioIdsOferta.set([]);
    this.intentado.set(false);
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
    const oferta = this.ofertasActivas().find(o => o.constructor_id === constructorId);
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
    this.intentado.set(true);
    if (!constructorId) { this.errorEnvio.set('admin_offer.err_constructor'); return; }
    if (this.serviciosOfertaInvalidos) { this.errorEnvio.set('service_selector.required'); return; }
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
      // Con un solo servicio no se envía: el alta lo asigna y la edición no lo toca.
      ...(this.multiServicio() ? { servicio_ids: this.servicioIdsOferta() } : {}),
    };

    this.enviando.set(true);
    try {
      if (esNueva) {
        await this.ofertaService.enviar(
          this.expedienteId, constructorId, form, docs, this.videoOferta(),
        );
        this.enviada.set(true);
        this.exitoMsg.set('make_offer.success_sent');
        const ofertas  = await this.recargarOfertas();
        const newOffer = ofertas.find(o => o.constructor_id === constructorId);
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
        // Sin esto la tarjeta de «Ofertas recibidas» seguía mostrando el precio
        // y el plazo anteriores hasta recargar la página.
        await this.recargarOfertas();
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

  /** Servicios que cubre una oferta, para su tarjeta: nombres o «Todos los servicios». */
  serviciosDeOfertaTexto(oferta: OfertaConConstructor): string | null {
    return resumirServicios(
      serviciosDeOferta(this.opcionesServicio(), oferta).map(s => s.id),
      this.opcionesServicio(),
      total => this.translate.instant('service_selector.all', { total }),
    );
  }

  /** Nombres de todos los servicios en el idioma activo; el principal primero. */
  serviciosNombres(): { id: number; nombre: string }[] {
    const lang = this.translate.currentLang;
    return this.servicios().map(s => ({ id: s.id, nombre: nombreServicio(s, lang) }));
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

  /** El trofeo de una tarjeta: adjudicar esa sola oferta. */
  async adjudicarOferta(oferta: OfertaConConstructor) {
    this.confirmandoAdjudicarId.set(null);
    await this.adjudicar([oferta.id]);
  }

  /** «Adjudicar selección»: una, varias o todas las marcadas. */
  async adjudicarSeleccion() {
    this.confirmandoAdjudicarSeleccion.set(false);
    await this.adjudicar(this.seleccionadasParaAdjudicar().map(o => o.id));
  }

  /**
   * Adjudica N ofertas: el RPC crea UN CONTRATO POR OFERTA en una sola
   * transacción y devuelve los contratos creados; aquí se genera y sube un PDF
   * para cada uno.
   *
   * Los PDF de los contratos que el RPC sustituye se capturan ANTES de llamar,
   * porque después ya no hay fila de la que leer la ruta y quedarían huérfanos
   * en el bucket.
   *
   * Un fallo generando un PDF no deshace la adjudicación: los contratos ya
   * están en la base y son lo que cuenta. Se informa de cuántos PDF fallaron
   * para poder reintentarlo.
   */
  private async adjudicar(ofertaIds: string[]) {
    if (this.adjudicando() || !ofertaIds.length) return;
    this.adjudicando.set(true);
    this.errorAdjudicar.set('');
    this.exitoAdjudicar.set('');
    try {
      const pdfsAnteriores = (await this.contratoService.listarPorExpediente(this.expedienteId))
        .map(c => c.url_pdf)
        .filter((u): u is string => !!u);

      const creados = await this.contratoService.adjudicarOfertas(this.expedienteId, ofertaIds);

      const [ofertas, detalle] = await Promise.all([
        this.ofertaService.getOfertasDeExpediente(this.expedienteId, true),
        this.expedienteService.getExpedienteParaOferta(this.expedienteId),
      ]);
      this.todasLasOfertas.set(this.ordenarOfertas(ofertas));
      this.detalle.set(detalle);
      this.limpiarSeleccion();

      // Best-effort: si la limpieza falla, el contrato nuevo sigue siendo válido.
      for (const url of pdfsAnteriores) {
        await this.contratoService.eliminarPdfStorage(url).catch(() => {});
      }

      // Servicios del expediente, leídos una vez; cada PDF lleva los de su oferta.
      const serviciosExp = await this.expedienteService.getServiciosCompletos(this.expedienteId);
      const lang         = this.translate.currentLang;

      let fallidos = 0;
      for (const { id_contrato, id_oferta } of creados) {
        const oferta = this.todasLasOfertas().find(o => o.id === id_oferta);
        if (!oferta) { fallidos++; continue; }
        try {
          await this.generarPdfContrato(
            id_contrato, oferta, serviciosParaContrato(serviciosDeOferta(serviciosExp, oferta), lang),
          );
        } catch {
          fallidos++;
        }
      }

      this.exitoAdjudicar.set(
        fallidos
          ? this.translate.instant('admin_offer.adjudicar_pdf_parcial', { n: creados.length - fallidos, total: creados.length })
          : this.translate.instant('admin_offer.adjudicar_ok', { n: creados.length }),
      );
    } catch (e: any) {
      this.errorAdjudicar.set(e.message);
    } finally {
      this.adjudicando.set(false);
    }
  }

  /** Genera el PDF de un contrato y lo enlaza a su fila. */
  private async generarPdfContrato(
    contratoId: string,
    oferta:     OfertaConConstructor,
    servicios:  ServicioPdf[],
  ) {
    const d    = this.detalle()!;
    const lang = this.translate.currentLang;
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale   = localeMap[lang] ?? 'fr-CA';
    const fechaHoy = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

    const pdfData: ContratoPdfData = {
      contratoId,
      expedienteNumero:    d.numero,
      fechaGenerado:       fechaHoy,
      clienteNombre:       d.cliente_nombre,
      constructorNombre:   oferta.constructor_nombre,
      constructorTelefono: oferta.constructor_telefono,
      constructorEmail:    oferta.constructor_email,
      servicios,
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
    const pdfPath = await this.contratoService.subirPdf(pdfBlob, contratoId);
    await this.contratoService.actualizarUrlPdf(contratoId, pdfPath);
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
    // Una oferta dada de baja se consulta, no se edita: cargarla en el
    // formulario daría a entender que se puede guardar encima.
    if (this.esEliminada(oferta)) return;
    this.constructorSeleccionadoId.set(oferta.constructor_id);
    this.popularFormulario(oferta);
    this.confirmandoEliminar.set(false);
    this.confirmandoEliminarId.set(null);
    this.errorEliminar.set('');
    this.errorEliminarLista.set('');
  }

  /**
   * Deshace la baja. El RPC rechaza la restauración si el constructor ya
   * volvió a ofertar o si el expediente llegó a cinco ofertas activas; ese
   * mensaje se muestra tal cual, que es lo que el administrador necesita saber.
   */
  async restaurarOferta(oferta: OfertaConConstructor) {
    if (this.restaurando()) return;
    this.restaurando.set(oferta.id);
    this.errorRestaurar.set('');
    try {
      await this.ofertaService.restaurarOferta(oferta.id, this.expedienteId);
      const [ofertas, detalle] = await Promise.all([
        this.ofertaService.getOfertasDeExpediente(this.expedienteId, true),
        this.expedienteService.getExpedienteParaOferta(this.expedienteId),
      ]);
      this.todasLasOfertas.set(this.ordenarOfertas(ofertas));
      this.detalle.set(detalle);
    } catch (e: any) {
      this.errorRestaurar.set(e.message);
    } finally {
      this.restaurando.set(null);
    }
  }

  async eliminarOfertaLista(oferta: OfertaConConstructor) {
    if (this.eliminando()) return;
    this.eliminando.set(true);
    this.errorEliminarLista.set('');
    try {
      await this.ofertaService.eliminarOferta(oferta.id, this.expedienteId);
      const restantes = await this.recargarOfertas();
      // La baja también cambia el estado del expediente (a 'estimado' si era la
      // última, o de vuelta a 'en_oferta' si era la adjudicada).
      this.detalle.set(await this.expedienteService.getExpedienteParaOferta(this.expedienteId));
      if (oferta.id === this.ofertaId()) {
        this.limpiarFormulario();
        this.constructorSeleccionadoId.set('');
        const first = restantes.find(o => !o.eliminada_en);
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

  /**
   * `estado` viaja como `string` en el modelo, así que un valor nuevo del enum
   * `estado_oferta` se colaría hasta la plantilla y ngx-translate pintaría la
   * clave cruda («admin_offer.oferta_retirada»). Ante lo desconocido, el propio
   * valor es más legible que una clave sin traducir.
   */
  estadoOfertaKey(estado: string): string {
    const conocidos = ['pendiente', 'aceptada', 'rechazada'];
    return conocidos.includes(estado) ? `admin_offer.oferta_${estado}` : estado;
  }

  initiales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  }

  volver() {
    this.router.navigate(['/admin/offer']);
  }
}
