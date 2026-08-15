import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../../services/archivo.service';
import { InvitacionService } from '../../../services/invitacion.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
import { PerfilRepository, PerfilNombre, PerfilInvitable } from '../../../data/perfil.repository';
import { ArchivoRow, debeAvanzarEstado } from '../../../models';
import { FILE_LIMITS, validateFile } from '../../../shared/validators/file.validator';
import { matterportThumb } from '../../../shared/util/matterport';

/**
 * Informe del estimador de un expediente (admin).
 * Extraído de admin/file/edit: contiene el formulario de estimación,
 * los tours 3D, las fotos del sitio y los documentos técnicos.
 */
@Component({
  selector: 'app-admin-file-estimator-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './estimator-report.component.html',
  styleUrl: './estimator-report.component.css',
})
export class AdminFileEstimatorReportComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private perfilRepo        = inject(PerfilRepository);
  private invitacionService = inject(InvitacionService);
  private edgeErr           = inject(EdgeErrorService);

  /** Id del expediente cuyo informe se edita. */
  expedienteId = input.required<string>();
  /** Estado actual del expediente (lo mantiene el padre). */
  estado = input<string>('');

  /** Nuevo estado del expediente cuando el guardado del informe lo hace avanzar. */
  estadoChange = output<string>();
  /** Nombre completo del estimador asignado al guardar. */
  estimadorAsignado = output<string>();

  private user = toSignal(this.auth.user$);

  // ── Formulario de estimación ───────────────────────────────────────────────
  estimadores             = signal<PerfilNombre[]>([]);
  estimadorSeleccionadoId = signal<string>('');

  fechaVisitaReal     = '';
  horaVisitaReal      = '';
  descripcionProblema = '';
  notasInternas       = '';
  costoMin: number | null = null;
  costoMax: number | null = null;
  urlsTour            = signal<string[]>([]);

  guardandoEst  = signal(false);
  errorEst      = signal('');
  exitoEst      = signal(false);
  hasEstimacion = signal(false);

  // ── Invitación a constructores ─────────────────────────────────────────────
  constructores       = signal<PerfilInvitable[]>([]);
  invitadosIds        = signal<Set<string>>(new Set());
  seleccionInvitados  = signal<Set<string>>(new Set());
  // Contraseña que el administrador escribe para cada constructor, si decide
  // mandarle credenciales nuevas. Vacía = no se toca su acceso actual.
  passwordsInvitados  = signal<Record<string, string>>({});
  enviandoInvitacion  = signal(false);
  abriendoATodos      = signal(false);
  // Abrir a todos borra la lista de invitados: se confirma antes de hacerlo.
  confirmarAbrirATodos = signal(false);
  exitoInvitacionMsg  = signal('');
  exitoInvitacionArgs = signal<Record<string, number>>({});
  errorInvitacionMsg  = signal('');

  // ── Archivos del estimador (fotos / documentos) ────────────────────────────
  fotos             = signal<ArchivoRow[]>([]);
  documentos        = signal<ArchivoRow[]>([]);
  subiendoFoto      = signal(false);
  subiendoDoc       = signal(false);
  errorFotos        = signal('');
  errorDocs         = signal('');
  eliminandoArchivo = signal<string | null>(null);
  fotoAmpliada      = signal<string | null>(null);

  // ── Tours virtuales 3D ─────────────────────────────────────────────────────
  nuevoTourUrl  = '';
  guardandoTour = signal(false);
  errorTour     = signal('');

  get costoValido(): boolean {
    if (this.costoMin === null && this.costoMax === null) return true;
    if (this.costoMin === null || this.costoMax === null) return false;
    return this.costoMin >= 0 && this.costoMax >= this.costoMin;
  }

  /** El informe tiene lo mínimo para poder guardarse («Enviar invitación»). */
  get formularioCompleto(): boolean {
    return !!(
      this.estimadorSeleccionadoId() &&
      this.fechaVisitaReal &&
      this.horaVisitaReal &&
      this.descripcionProblema.trim() &&
      this.costoValido
    );
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.cargarEstimadores();
    await Promise.all([
      this.cargarEstimadorAsignado(),
      this.cargarEstimacion(),
      this.cargarArchivos(),
      this.cargarInvitaciones(),
    ]);
  }

  private async cargarEstimadores() {
    try {
      const lista = await this.perfilRepo.findActivosByRoles(['estimador']);
      this.estimadores.set(lista);
    } catch (e: any) {
      console.error('[AdminFileEstimatorReport] estimadores:', e.message);
    }
  }

  private async cargarEstimadorAsignado() {
    try {
      const detalle = await this.expedienteService.getDetalle(this.expedienteId());
      this.estimadorSeleccionadoId.set(detalle.estimador_id ?? '');

      // El estimador ya asignado se conserva como opción aunque hoy esté
      // inactivo o tenga otro rol, para no perder la asignación existente.
      if (detalle.estimador_id && !this.estimadores().some(e => e.id === detalle.estimador_id)) {
        const asignado = await this.perfilRepo.findByIds([detalle.estimador_id]);
        this.estimadores.update(lista => [...asignado, ...lista]);
      }
    } catch (e: any) {
      console.error('[AdminFileEstimatorReport] estimador asignado:', e.message);
    }
  }

  private async cargarEstimacion() {
    try {
      const est = await this.estimacionService.get(this.expedienteId());
      if (!est) return;
      if (est.fecha_visita_real) {
        this.fechaVisitaReal = est.fecha_visita_real.slice(0, 10);
        this.horaVisitaReal  = est.fecha_visita_real.slice(11, 16);
      }
      this.descripcionProblema = est.descripcion_problemas ?? '';
      this.costoMin            = est.costo_estimado;
      this.costoMax            = est.costo_estimado_max;
      this.notasInternas       = est.notas_internas ?? '';
      this.urlsTour.set(EstimacionService.parseUrls(est.url_tour));
      this.hasEstimacion.set(true);
    } catch (e: any) {
      console.error('[AdminFileEstimatorReport] cargarEstimacion:', e.message);
    }
  }

  private async cargarArchivos() {
    try {
      const { fotos, documentos } = await this.archivoService.cargarTodos(this.expedienteId());
      this.fotos.set(fotos);
      this.documentos.set(documentos);
    } catch (e: any) {
      console.error('[AdminFileEstimatorReport] cargarArchivos:', e.message);
    }
  }

  // ── Invitación a constructores ─────────────────────────────────────────────

  /** Carga aparte del informe: un fallo aquí no debe tumbar la pestaña. */
  private async cargarInvitaciones() {
    try {
      const [constructores, invitados] = await Promise.all([
        this.perfilRepo.findActivosByRolesInvitables(['constructor']),
        this.invitacionService.getConstructorIdsInvitados(this.expedienteId()),
      ]);
      this.constructores.set(constructores);
      this.invitadosIds.set(invitados);
    } catch (e: any) {
      console.error('[AdminFileEstimatorReport] invitaciones:', e.message);
    }
  }

  /**
   * Se invita desde el expediente en estimación igual que desde el ya estimado:
   * «Enviar invitación-correo» guarda antes el informe, y ese guardado es el que
   * lo pasa a `estimado` — único estado desde el que la función
   * `enviar-invitacion` acepta invitar.
   */
  get puedeInvitar(): boolean {
    const estado = this.estado();
    return estado === 'en_estimacion' || estado === 'estimado' || estado === 'en_oferta';
  }

  /**
   * Con ofertas ya en curso no se cambia quién ve el expediente: los
   * constructores que están preparando su oferta no deben perder el acceso, ni
   * entrar otros a mitad de la ronda.
   */
  get bloqueadoPorOferta(): boolean {
    return this.estado() === 'en_oferta';
  }

  estaInvitado(id: string): boolean {
    return this.invitadosIds().has(id);
  }

  /** Pide confirmación antes de abrir el expediente a todos: borra invitados. */
  pedirAbrirATodos() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');
    this.confirmarAbrirATodos.set(true);
  }

  cancelarAbrirATodos() {
    this.confirmarAbrirATodos.set(false);
  }

  /**
   * «Todos los Constructores»: retira las invitaciones por correo y el
   * expediente vuelve a ser público — lo ve y puede ofertar cualquier
   * constructor, no solo los invitados.
   */
  async abrirATodosLosConstructores() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');
    this.confirmarAbrirATodos.set(false);

    this.abriendoATodos.set(true);
    try {
      await this.invitacionService.abrirATodosLosConstructores(this.expedienteId());
      this.seleccionInvitados.set(new Set());
      this.passwordsInvitados.set({});
      await this.cargarInvitaciones();
      this.exitoInvitacionArgs.set({});
      this.exitoInvitacionMsg.set('admin_invite.all_builders_done');
    } catch (e: any) {
      this.errorInvitacionMsg.set(this.edgeErr.clave(e, 'admin_invite.err_all_builders'));
    } finally {
      this.abriendoATodos.set(false);
    }
  }

  toggleSeleccionInvitado(id: string) {
    const s = new Set(this.seleccionInvitados());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.seleccionInvitados.set(s);
  }

  passwordInvitado(id: string): string {
    return this.passwordsInvitados()[id] ?? '';
  }

  setPasswordInvitado(id: string, valor: string) {
    this.passwordsInvitados.update(prev => ({ ...prev, [id]: valor }));
  }

  /**
   * Contraseñas a mandar, solo las escritas. Enviar una implica *fijarla*: la
   * guardada está hasheada y no se puede leer. Las que se dejan vacías no tocan
   * el acceso del constructor, que entra con la suya de siempre.
   */
  private clavesEscritas(ids: string[]): Record<string, string> {
    const mapa = this.passwordsInvitados();
    const out: Record<string, string> = {};
    for (const id of ids) {
      const clave = (mapa[id] ?? '').trim();
      if (clave) out[id] = clave;
    }
    return out;
  }

  async enviarInvitaciones(): Promise<boolean> {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');

    const ids = [...this.seleccionInvitados()];
    if (!ids.length) {
      this.errorInvitacionMsg.set('admin_invite.err_none');
      return false;
    }

    this.enviandoInvitacion.set(true);
    try {
      const r = await this.invitacionService.enviarInvitaciones(
        this.expedienteId(), ids, this.clavesEscritas(ids),
      );
      // Los que fallaron no quedan invitados: la función revierte su registro.
      const enviadosIds = r.fallidos
        ? ids.filter(id => !r.errores.some(e => e.constructor_id === id))
        : ids;
      this.invitadosIds.update(prev => new Set([...prev, ...enviadosIds]));
      this.seleccionInvitados.set(new Set());
      this.passwordsInvitados.set({});
      this.exitoInvitacionArgs.set({ ok: r.enviados, ko: r.fallidos });
      this.exitoInvitacionMsg.set(r.fallidos ? 'admin_invite.success_partial' : 'admin_invite.success');
      return true;
    } catch (e: any) {
      // La plantilla traduce el contenido de este signal: se guarda la clave.
      this.errorInvitacionMsg.set(this.edgeErr.clave(e, 'admin_invite.err_send'));
      return false;
    } finally {
      this.enviandoInvitacion.set(false);
    }
  }

  /**
   * «Enviar invitación»: manda el correo y además hace lo mismo que el botón de
   * guardar el informe. La estimación se guarda primero para que el correo salga
   * con los datos recién grabados (visita, problemas observados, estimador).
   */
  async enviarInvitacionYEstimacion() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');

    if (!this.seleccionInvitados().size) {
      this.errorInvitacionMsg.set('admin_invite.err_none');
      return;
    }
    if (!(await this.guardarEstimacion())) {
      // `guardarEstimacion` ya dejó el motivo en su propio aviso; aquí solo se
      // señala que por eso no se envió ningún correo.
      this.errorInvitacionMsg.set('admin_invite.err_estimation_first');
      return;
    }
    await this.enviarInvitaciones();
  }

  // ── Guardar informe ────────────────────────────────────────────────────────

  /** Devuelve si la estimación quedó guardada: «Enviar invitación» lo encadena. */
  async guardarEstimacion(): Promise<boolean> {
    this.exitoEst.set(false);
    this.errorEst.set('');

    if (!this.fechaVisitaReal || !this.horaVisitaReal) {
      this.errorEst.set('estimator_form.err_visit');
      return false;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorEst.set('estimator_form.err_problems');
      return false;
    }
    if (!this.costoValido) {
      this.errorEst.set('estimator_form.err_cost');
      return false;
    }
    const estimadorId = this.estimadorSeleccionadoId();
    if (!estimadorId) {
      this.errorEst.set('admin_estimate.err_estimador');
      return false;
    }

    this.guardandoEst.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId(), estimadorId, {
        fechaVisita:          this.fechaVisitaReal,
        horaVisita:           this.horaVisitaReal,
        descripcionProblemas: this.descripcionProblema.trim(),
        costoMin:             this.costoMin,
        costoMax:             this.costoMax,
        notasInternas:        this.notasInternas.trim(),
        urlTour:              EstimacionService.serializeUrls(
          this.urlsTour().map(u => u.trim()).filter(Boolean),
        ),
      });
      // Igual que «Enviar estimación» de admin/to-estimate/edit: asigna el
      // estimador y deja el expediente en `estimado`. Solo avanza si aún no
      // llegó ahí — reeditar el informe de uno en oferta, adjudicado o
      // contratado no debe hacerlo retroceder, ni reactivar uno cancelado. Por
      // eso en esos estados se reasigna el estimador sin tocar el estado
      // (`asignarEstimador` fijaría 'en_estimacion').
      const avanza = debeAvanzarEstado(this.estado(), 'estimado');
      if (avanza) {
        await this.expedienteService.asignarEstimador(this.expedienteId(), estimadorId);
        await this.expedienteService.actualizarEstado(this.expedienteId(), 'estimado');
        this.estadoChange.emit('estimado');
      } else {
        await this.expedienteService.reasignarEstimador(this.expedienteId(), estimadorId);
      }
      const est = this.estimadores().find(x => x.id === estimadorId);
      if (est) this.estimadorAsignado.emit(`${est.nombre} ${est.apellido}`.trim());
      this.hasEstimacion.set(true);
      this.exitoEst.set(true);
      return true;
    } catch (e: any) {
      this.errorEst.set(e.message ?? 'admin_file_edit.save_error');
      return false;
    } finally {
      this.guardandoEst.set(false);
    }
  }

  // ── Tours virtuales 3D ─────────────────────────────────────────────────────
  tourThumb(url: string): string | null {
    return matterportThumb(url);
  }

  async agregarTour() {
    const url = this.nuevoTourUrl.trim();
    if (!url) return;
    const nuevaLista = [...this.urlsTour(), url];
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      // Si ya existe una estimación, persiste de inmediato; si no, se guardará
      // junto con el informe al pulsar "Guardar informe".
      if (this.hasEstimacion()) {
        await this.estimacionService.actualizarUrlsTour(this.expedienteId(), nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
      this.nuevoTourUrl = '';
    } catch (e: any) {
      this.errorTour.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoTour.set(false);
    }
  }

  async eliminarTour(i: number) {
    const nuevaLista = this.urlsTour().filter((_, idx) => idx !== i);
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasEstimacion()) {
        await this.estimacionService.actualizarUrlsTour(this.expedienteId(), nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
    } catch (e: any) {
      this.errorTour.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoTour.set(false);
    }
  }

  // ── Fotos del sitio / Documentos técnicos ──────────────────────────────────
  // El `accept` de un <input file> sólo filtra el diálogo, no el arrastre. Como
  // FILE_LIMITS.DOCUMENTO.types admite '' (MIME vacío de .csv/.txt), un archivo
  // soltado con MIME desconocido pasaría: se valida también la extensión.
  private readonly DOC_EXT = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv'];

  async subirFotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.procesarFotos(files);
  }

  async subirDocumentos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.procesarDocumentos(files);
  }

  private async procesarFotos(files: File[]) {
    if (!files.length || this.subiendoFoto()) return;
    const userId = this.user()?.id;
    if (!userId) { this.errorFotos.set('estimator_form.err_session'); return; }
    this.errorFotos.set('');
    for (const file of files) {
      const err = validateFile(file, FILE_LIMITS.FOTO.maxBytes, FILE_LIMITS.FOTO.types);
      if (err) { this.errorFotos.set(err); return; }
    }
    this.subiendoFoto.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId(), 'foto', file, userId);
      this.fotos.set(await this.archivoService.cargarPorTipo(this.expedienteId(), 'foto'));
    } catch (e: any) {
      this.errorFotos.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  private async procesarDocumentos(files: File[]) {
    if (!files.length || this.subiendoDoc()) return;
    const userId = this.user()?.id;
    if (!userId) { this.errorDocs.set('estimator_form.err_session'); return; }
    this.errorDocs.set('');
    for (const file of files) {
      const nombre = file.name.toLowerCase();
      const punto  = nombre.lastIndexOf('.');
      const ext    = punto >= 0 ? nombre.slice(punto) : '';
      if (!this.DOC_EXT.includes(ext)) { this.errorDocs.set('validation.file_type'); return; }
      const err = validateFile(file, FILE_LIMITS.DOCUMENTO.maxBytes, FILE_LIMITS.DOCUMENTO.types);
      if (err) { this.errorDocs.set(err); return; }
    }
    this.subiendoDoc.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId(), 'documento', file, userId);
      this.documentos.set(await this.archivoService.cargarPorTipo(this.expedienteId(), 'documento'));
    } catch (e: any) {
      this.errorDocs.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.subiendoDoc.set(false);
    }
  }

  // ── Arrastrar y soltar ─────────────────────────────────────────────────────
  dragFotos = signal(false);
  dragDocs  = signal(false);

  onDragOverFotos(e: DragEvent) {
    e.preventDefault();
    if (!this.subiendoFoto()) this.dragFotos.set(true);
  }
  onDragLeaveFotos() { this.dragFotos.set(false); }
  async onDropFotos(e: DragEvent) {
    e.preventDefault();
    this.dragFotos.set(false);
    await this.procesarFotos(Array.from(e.dataTransfer?.files ?? []));
  }

  onDragOverDocs(e: DragEvent) {
    e.preventDefault();
    if (!this.subiendoDoc()) this.dragDocs.set(true);
  }
  onDragLeaveDocs() { this.dragDocs.set(false); }
  async onDropDocs(e: DragEvent) {
    e.preventDefault();
    this.dragDocs.set(false);
    await this.procesarDocumentos(Array.from(e.dataTransfer?.files ?? []));
  }

  async eliminarArchivo(archivo: ArchivoRow, tipo: TipoArchivo) {
    const setError = tipo === 'foto' ? this.errorFotos : this.errorDocs;
    setError.set('');
    this.eliminandoArchivo.set(archivo.id);
    try {
      await this.archivoService.eliminar(archivo);
      const lista = await this.archivoService.cargarPorTipo(this.expedienteId(), tipo);
      if (tipo === 'foto') this.fotos.set(lista); else this.documentos.set(lista);
    } catch (e: any) {
      setError.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.eliminandoArchivo.set(null);
    }
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }
  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }
  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }
  cerrarFoto() { this.fotoAmpliada.set(null); }
  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
}
