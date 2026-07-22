import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../../services/archivo.service';
import { PerfilRepository, PerfilNombre, PerfilContacto } from '../../../data/perfil.repository';
import { InvitacionService } from '../../../services/invitacion.service';
import { ExpedienteDetalle, ArchivoRow } from '../../../models';
import { FILE_LIMITS, validateFile } from '../../../shared/validators/file.validator';

@Component({
  selector: 'app-admin-to-estimate-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl:    './edit.component.css',
})
export class AdminToEstimateEditComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private perfilRepo        = inject(PerfilRepository);
  private invitacionService = inject(InvitacionService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  user     = toSignal(this.auth.user$);
  detalle  = signal<ExpedienteDetalle | null>(null);
  cargando = signal(true);
  errorMsg = signal<string>('');

  fechaVisita         = '';
  horaVisita          = '';
  descripcionProblema = '';
  notasInternas       = '';
  costoMin: number | null = null;
  costoMax: number | null = null;

  guardando       = signal(false);
  exitoMsg        = signal('');
  errorGuardado   = signal('');
  guardandoVisita = signal(false);
  exitoVisitaMsg  = signal('');
  errorVisitaMsg  = signal('');

  fotos      = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  subiendoFoto      = signal(false);
  subiendoDocumento = signal(false);
  errorFotos        = signal('');
  errorDocumentos   = signal('');

  hasDraft = signal(false);

  eliminando         = signal(false);
  errorEliminar      = signal('');
  confirmandoEliminar = signal(false);

  estimadores             = signal<PerfilNombre[]>([]);
  estimadorSeleccionadoId = signal<string>('');

  // ── Invitación a constructores ─────────────────────────────────────────────
  constructores        = signal<PerfilContacto[]>([]);
  invitadosIds         = signal<Set<string>>(new Set());
  seleccionInvitados   = signal<Set<string>>(new Set());
  enviandoInvitacion   = signal(false);
  exitoInvitacionMsg   = signal('');
  errorInvitacionMsg   = signal('');

  urlsTour         = signal<string[]>([]);
  collapsedSet     = signal<Set<number>>(new Set());
  editandoIndex    = signal<number | null>(null);
  editandoUrlTemp  = '';
  mostrandoFormAdd = signal(false);
  nuevoUrlInput    = '';
  guardandoTour    = signal(false);
  errorTour        = signal('');

  private expedienteId = '';

  get formularioCompleto(): boolean {
    return !!(
      this.estimadorSeleccionadoId() &&
      this.fechaVisita &&
      this.horaVisita &&
      this.descripcionProblema.trim() &&
      this.costoValido
    );
  }

  get borradorValido(): boolean {
    return !!this.estimadorSeleccionadoId();
  }

  get costoValido(): boolean {
    if (this.costoMin === null && this.costoMax === null) return true;
    if (this.costoMin === null || this.costoMax === null) return false;
    return this.costoMin >= 0 && this.costoMax >= this.costoMin;
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [detalle, estimacion, estimadoresList] = await Promise.all([
        this.expedienteService.getDetalle(id),
        this.estimacionService.get(id),
        this.perfilRepo.findActivosByRoles(['estimador']),
      ]);
      this.detalle.set(detalle);

      // El estimador ya asignado se conserva como opción aunque hoy esté
      // inactivo o tenga otro rol, para no perder la asignación existente.
      let lista = estimadoresList;
      if (detalle.estimador_id && !lista.some(e => e.id === detalle.estimador_id)) {
        const asignado = await this.perfilRepo.findByIds([detalle.estimador_id]);
        lista = [...asignado, ...lista];
      }
      this.estimadores.set(lista);
      this.estimadorSeleccionadoId.set(detalle.estimador_id ?? '');

      if (estimacion) {
        if (estimacion.fecha_visita_real) {
          this.fechaVisita = estimacion.fecha_visita_real.slice(0, 10);
          this.horaVisita  = estimacion.fecha_visita_real.slice(11, 16);
        }
        this.descripcionProblema = estimacion.descripcion_problemas;
        this.costoMin            = estimacion.costo_estimado;
        this.costoMax            = estimacion.costo_estimado_max;
        this.notasInternas       = estimacion.notas_internas;
        this.urlsTour.set(EstimacionService.parseUrls(estimacion.url_tour));
        this.hasDraft.set(true);
      }
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }

    this.cargarArchivos();
    this.cargarInvitaciones();
  }

  // ── Invitación a constructores ─────────────────────────────────────────────

  /** Carga aparte del detalle: un fallo aquí no debe tumbar la página. */
  private async cargarInvitaciones() {
    try {
      const [constructores, invitados] = await Promise.all([
        this.perfilRepo.findActivosByRolesWithContact(['constructor']),
        this.invitacionService.getConstructorIdsInvitados(this.expedienteId),
      ]);
      this.constructores.set(constructores);
      this.invitadosIds.set(invitados);
    } catch (e: any) {
      console.error('[AdminToEstimateEdit] invitaciones:', e.message);
    }
  }

  /** Solo se puede invitar cuando el expediente ya está estimado. */
  get puedeInvitar(): boolean {
    const estado = this.detalle()?.estado;
    return estado === 'estimado' || estado === 'en_oferta';
  }

  estaInvitado(id: string): boolean {
    return this.invitadosIds().has(id);
  }

  toggleSeleccionInvitado(id: string) {
    const s = new Set(this.seleccionInvitados());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.seleccionInvitados.set(s);
  }

  async enviarInvitaciones() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');

    const ids = [...this.seleccionInvitados()];
    if (!ids.length) {
      this.errorInvitacionMsg.set('admin_invite.err_none');
      return;
    }

    this.enviandoInvitacion.set(true);
    try {
      await this.invitacionService.enviarInvitaciones(this.expedienteId, ids);
      this.invitadosIds.update(prev => new Set([...prev, ...ids]));
      this.seleccionInvitados.set(new Set());
      this.exitoInvitacionMsg.set('admin_invite.success');
    } catch (e: any) {
      this.errorInvitacionMsg.set(e.message);
    } finally {
      this.enviandoInvitacion.set(false);
    }
  }

  async guardarEstimacion() {
    this.errorGuardado.set('');
    this.exitoMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorGuardado.set('estimator_form.err_visit');
      return;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorGuardado.set('estimator_form.err_problems');
      return;
    }
    if (!this.costoValido) {
      this.errorGuardado.set('estimator_form.err_cost');
      return;
    }

    const estimadorId = this.estimadorSeleccionadoId();
    if (!estimadorId) { this.errorGuardado.set('admin_estimate.err_estimador'); return; }

    this.guardando.set(true);
    try {
      await Promise.all([
        this.estimacionService.guardar(this.expedienteId, estimadorId, {
          fechaVisita:          this.fechaVisita,
          horaVisita:           this.horaVisita,
          descripcionProblemas: this.descripcionProblema.trim(),
          costoMin:             this.costoMin,
          costoMax:             this.costoMax,
          notasInternas:        this.notasInternas.trim(),
          urlTour:              EstimacionService.serializeUrls(this.urlsTour()),
        }),
        this.expedienteService.asignarEstimador(this.expedienteId, estimadorId),
      ]);
      await this.expedienteService.actualizarEstado(this.expedienteId, 'estimado');
      this.detalle.update(d => d ? { ...d, estado: 'estimado' } : d);
      this.hasDraft.set(true);
      this.exitoMsg.set('estimator_form.success_estimation');
    } catch (e: any) {
      this.errorGuardado.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  async guardarVisita() {
    this.errorVisitaMsg.set('');
    this.exitoVisitaMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorVisitaMsg.set('estimator_form.err_visit');
      return;
    }

    const estimadorId = this.estimadorSeleccionadoId();
    if (!estimadorId) { this.errorVisitaMsg.set('admin_estimate.err_estimador'); return; }

    this.guardandoVisita.set(true);
    try {
      await Promise.all([
        this.estimacionService.guardar(this.expedienteId, estimadorId, {
          fechaVisita:          this.fechaVisita,
          horaVisita:           this.horaVisita,
          descripcionProblemas: this.descripcionProblema.trim(),
          costoMin:             this.costoMin,
          costoMax:             this.costoMax,
          notasInternas:        this.notasInternas.trim(),
          urlTour:              EstimacionService.serializeUrls(this.urlsTour()),
        }),
        this.expedienteService.asignarEstimador(this.expedienteId, estimadorId),
      ]);
      this.hasDraft.set(true);
      this.exitoVisitaMsg.set('estimator_form.success_draft');
    } catch (e: any) {
      this.errorVisitaMsg.set(e.message);
    } finally {
      this.guardandoVisita.set(false);
    }
  }

  // ── Archivos ──────────────────────────────────────────────────────────────

  private async cargarArchivos() {
    const { fotos, documentos } = await this.archivoService.cargarTodos(this.expedienteId);
    this.fotos.set(fotos);
    this.documentos.set(documentos);
  }

  private async recargar(tipo: TipoArchivo) {
    const data = await this.archivoService.cargarPorTipo(this.expedienteId, tipo);
    if (tipo === 'foto')      this.fotos.set(data);
    if (tipo === 'documento') this.documentos.set(data);
  }

  // ── Fotos del sitio / Documentos técnicos ──────────────────────────────────
  // El `accept` de un <input file> sólo filtra el diálogo, no el arrastre. Como
  // FILE_LIMITS.DOCUMENTO.types admite '' (MIME vacío de .csv/.txt), un archivo
  // soltado con MIME desconocido pasaría: se valida también la extensión.
  private readonly DOC_EXT = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt'];

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
    if (!userId) return;
    this.errorFotos.set('');
    for (const file of files) {
      const err = validateFile(file, FILE_LIMITS.FOTO.maxBytes, FILE_LIMITS.FOTO.types);
      if (err) { this.errorFotos.set(err); return; }
    }
    this.subiendoFoto.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId, 'foto', file, userId);
      await this.recargar('foto');
    } catch (e: any) { this.errorFotos.set(e.message); }
    finally { this.subiendoFoto.set(false); }
  }

  private async procesarDocumentos(files: File[]) {
    if (!files.length || this.subiendoDocumento()) return;
    const userId = this.user()?.id;
    if (!userId) return;
    this.errorDocumentos.set('');
    for (const file of files) {
      const nombre = file.name.toLowerCase();
      const punto  = nombre.lastIndexOf('.');
      const ext    = punto >= 0 ? nombre.slice(punto) : '';
      if (!this.DOC_EXT.includes(ext)) { this.errorDocumentos.set('validation.file_type'); return; }
      const err = validateFile(file, FILE_LIMITS.DOCUMENTO.maxBytes, FILE_LIMITS.DOCUMENTO.types);
      if (err) { this.errorDocumentos.set(err); return; }
    }
    this.subiendoDocumento.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId, 'documento', file, userId);
      await this.recargar('documento');
    } catch (e: any) { this.errorDocumentos.set(e.message); }
    finally { this.subiendoDocumento.set(false); }
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
    if (!this.subiendoDocumento()) this.dragDocs.set(true);
  }
  onDragLeaveDocs() { this.dragDocs.set(false); }
  async onDropDocs(e: DragEvent) {
    e.preventDefault();
    this.dragDocs.set(false);
    await this.procesarDocumentos(Array.from(e.dataTransfer?.files ?? []));
  }

  async eliminarArchivo(archivo: ArchivoRow, tipo: TipoArchivo) {
    const setError = tipo === 'foto' ? this.errorFotos : this.errorDocumentos;
    setError.set('');
    try {
      await this.archivoService.eliminar(archivo);
      await this.recargar(tipo);
    } catch (e: any) { setError.set(e.message); }
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
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
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'es-CR';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  // ── Tour multi-video ──────────────────────────────────────────────────────

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  get nuevoUrlSafe(): SafeResourceUrl | null {
    const url = this.nuevoUrlInput.trim();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  get editandoUrlSafe(): SafeResourceUrl | null {
    const url = this.editandoUrlTemp.trim();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  mostrarFormAgregarVideo() {
    this.nuevoUrlInput = '';
    this.editandoIndex.set(null);
    this.mostrandoFormAdd.set(true);
  }

  cancelarAgregarVideo() {
    this.mostrandoFormAdd.set(false);
    this.nuevoUrlInput = '';
    this.errorTour.set('');
  }

  async agregarVideo() {
    const url = this.nuevoUrlInput.trim();
    if (!url) return;
    const nuevaLista = [...this.urlsTour(), url];
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasDraft()) {
        await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
      this.mostrandoFormAdd.set(false);
      this.nuevoUrlInput = '';
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  iniciarEdicionVideo(i: number) {
    this.editandoIndex.set(i);
    this.editandoUrlTemp = this.urlsTour()[i];
    this.mostrandoFormAdd.set(false);
    this.errorTour.set('');
  }

  cancelarEdicionVideo() {
    this.editandoIndex.set(null);
    this.editandoUrlTemp = '';
    this.errorTour.set('');
  }

  async guardarEdicionVideo() {
    const i = this.editandoIndex();
    if (i === null) return;
    const url = this.editandoUrlTemp.trim();
    if (!url) return;
    const nuevaLista = [...this.urlsTour()];
    nuevaLista[i] = url;
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasDraft()) {
        await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
      this.editandoIndex.set(null);
      this.editandoUrlTemp = '';
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  async eliminarVideo(i: number) {
    const nuevaLista = this.urlsTour().filter((_, idx) => idx !== i);
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasDraft()) {
        await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
      const rebuilt = new Set<number>();
      for (const idx of this.collapsedSet()) {
        if (idx < i) rebuilt.add(idx);
        else if (idx > i) rebuilt.add(idx - 1);
      }
      this.collapsedSet.set(rebuilt);
      if (this.editandoIndex() === i) { this.editandoIndex.set(null); this.editandoUrlTemp = ''; }
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  isExpanded(i: number): boolean {
    return !this.collapsedSet().has(i);
  }

  toggleExpandVideo(i: number) {
    const s = new Set(this.collapsedSet());
    if (s.has(i)) s.delete(i); else s.add(i);
    this.collapsedSet.set(s);
  }

  get estimadorSeleccionadoNombre(): string {
    const id = this.estimadorSeleccionadoId();
    if (!id) return '';
    const est = this.estimadores().find(e => e.id === id);
    return est ? `${est.nombre} ${est.apellido}` : '';
  }

  get servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  get puedeEliminar(): boolean {
    const estado = this.detalle()?.estado;
    return this.hasDraft() && estado !== 'adjudicado' && estado !== 'contratado';
  }

  async eliminarEstimacion() {
    if (!this.puedeEliminar) return;
    this.errorEliminar.set('');
    this.eliminando.set(true);
    try {
      await this.archivoService.eliminarTodos(this.expedienteId);
      await this.estimacionService.eliminar(this.expedienteId);
      await this.expedienteService.liberar(this.expedienteId);
      this.router.navigate(['/admin/to-estimate']);
    } catch (e: any) {
      this.errorEliminar.set(e.message);
      this.confirmandoEliminar.set(false);
    } finally {
      this.eliminando.set(false);
    }
  }

  volver() { this.router.navigate(['/admin/to-estimate']); }
}
