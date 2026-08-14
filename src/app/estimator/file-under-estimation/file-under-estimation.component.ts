import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import { ExpedienteDetalle, ArchivoRow, debeAvanzarEstado } from '../../models';
import { FILE_LIMITS, validateFile } from '../../shared/validators/file.validator';
import { PerfilRepository, PerfilInvitable } from '../../data/perfil.repository';
import { InvitacionService } from '../../services/invitacion.service';
import { EdgeErrorService } from '../../services/edge-error.service';

@Component({
  selector: 'app-file-under-estimation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './file-under-estimation.component.html',
  styleUrl:    './file-under-estimation.component.css',
})
export class FileUnderEstimationComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private perfilRepo        = inject(PerfilRepository);
  private invitacionService = inject(InvitacionService);
  private edgeErr           = inject(EdgeErrorService);
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
  videos     = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  // Estas secciones muestran SOLO lo que agregó el estimador (no las fotos/
  // documentos del cliente). El tour (url_tour) ya es del estimador.
  // Fallback al usuario actual: en esta vista de trabajo el estimador es quien
  // sube los archivos aunque el expediente aún no tenga estimador_id persistido.
  fotosEstimador = computed(() => {
    const eid = this.detalle()?.estimador_id ?? this.user()?.id;
    return eid ? this.fotos().filter(f => f.subido_por === eid) : [];
  });
  documentosEstimador = computed(() => {
    const eid = this.detalle()?.estimador_id ?? this.user()?.id;
    return eid ? this.documentos().filter(d => d.subido_por === eid) : [];
  });

  // "Archivos del cliente": fotos, videos y documentos que agregó el cliente.
  fotosCliente = computed(() => {
    const cid = this.detalle()?.cliente_id;
    return cid ? this.fotos().filter(f => f.subido_por === cid) : [];
  });
  videosCliente = computed(() => {
    const cid = this.detalle()?.cliente_id;
    return cid ? this.videos().filter(v => v.subido_por === cid) : [];
  });
  documentosCliente = computed(() => {
    const cid = this.detalle()?.cliente_id;
    return cid ? this.documentos().filter(d => d.subido_por === cid) : [];
  });

  subiendoFoto      = signal(false);
  subiendoDocumento = signal(false);
  errorFotos        = signal('');
  errorDocumentos   = signal('');

  hasDraft         = signal(false);

  // ── Invitación a constructores ─────────────────────────────────────────────
  constructores        = signal<PerfilInvitable[]>([]);
  invitadosIds         = signal<Set<string>>(new Set());
  seleccionInvitados   = signal<Set<string>>(new Set());
  passwordsInvitados   = signal<Record<string, string>>({});
  enviandoInvitacion   = signal(false);
  abriendoATodos       = signal(false);
  confirmarAbrirATodos = signal(false);
  exitoInvitacionMsg   = signal('');
  exitoInvitacionArgs  = signal<Record<string, number>>({});
  errorInvitacionMsg   = signal('');

  // Tour multi-video
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
      this.fechaVisita &&
      this.horaVisita &&
      this.descripcionProblema.trim()
    );
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
      const [detalle, estimacion] = await Promise.all([
        this.expedienteService.getDetalle(id),
        this.estimacionService.get(id),
      ]);
      this.detalle.set(detalle);

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
      console.error('[FileUnderEstimation]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }

    this.cargarArchivos();
    this.cargarInvitaciones();
  }

  async guardarEstimacion(): Promise<boolean> {
    this.errorGuardado.set('');
    this.exitoMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorGuardado.set('estimator_form.err_visit');
      return false;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorGuardado.set('estimator_form.err_problems');
      return false;
    }
    if (!this.costoValido) {
      this.errorGuardado.set('estimator_form.err_cost');
      return false;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorGuardado.set('estimator_form.err_session'); return false; }

    this.guardando.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId, userId, {
        fechaVisita:          this.fechaVisita,
        horaVisita:           this.horaVisita,
        descripcionProblemas: this.descripcionProblema.trim(),
        costoMin:             this.costoMin,
        costoMax:             this.costoMax,
        notasInternas:        this.notasInternas.trim(),
        urlTour:              EstimacionService.serializeUrls(this.urlsTour()),
      });
      // Solo se avanza a `estimado` si el expediente aún no llegó ahí: reeditar
      // uno ya en oferta o más avanzado no debe hacerlo retroceder.
      if (debeAvanzarEstado(this.detalle()?.estado, 'estimado')) {
        await this.expedienteService.actualizarEstado(this.expedienteId, 'estimado');
        this.detalle.update(d => d ? { ...d, estado: 'estimado' } : d);
      }
      this.hasDraft.set(true);
      this.exitoMsg.set('estimator_form.success_estimation');
      return true;
    } catch (e: any) {
      console.error('[FileUnderEstimation] guardar:', e.message);
      this.errorGuardado.set(e.message);
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  // ── Invitación a constructores ─────────────────────────────────────────────

  /**
   * Todos los constructores activos, más los que ya están invitados. Carga
   * aparte del detalle: un fallo aquí no debe tumbar la página.
   */
  private async cargarInvitaciones() {
    try {
      const [constructores, invitados] = await Promise.all([
        this.perfilRepo.findActivosByRolesInvitables(['constructor']),
        this.invitacionService.getConstructorIdsInvitados(this.expedienteId),
      ]);
      this.constructores.set(constructores);
      this.invitadosIds.set(invitados);
    } catch (e: any) {
      console.error('[FileUnderEstimation] invitaciones:', e.message);
    }
  }

  /** Con oferta en curso ya no se toca la lista de invitados. */
  get bloqueadoPorOferta(): boolean { return this.detalle()?.estado === 'en_oferta'; }

  estaInvitado(id: string): boolean { return this.invitadosIds().has(id); }

  pedirAbrirATodos() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');
    this.confirmarAbrirATodos.set(true);
  }
  cancelarAbrirATodos() { this.confirmarAbrirATodos.set(false); }

  async abrirATodosLosConstructores() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');
    this.confirmarAbrirATodos.set(false);
    this.abriendoATodos.set(true);
    try {
      await this.invitacionService.abrirATodosLosConstructores(this.expedienteId);
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

  passwordInvitado(id: string): string { return this.passwordsInvitados()[id] ?? ''; }
  setPasswordInvitado(id: string, valor: string) {
    this.passwordsInvitados.update(prev => ({ ...prev, [id]: valor }));
  }

  /** Solo viajan las claves realmente escritas: una vacía no debe pisar la actual. */
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
    if (!ids.length) { this.errorInvitacionMsg.set('admin_invite.err_none'); return false; }

    this.enviandoInvitacion.set(true);
    try {
      const r = await this.invitacionService.enviarInvitaciones(
        this.expedienteId, ids, this.clavesEscritas(ids),
      );
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
      this.errorInvitacionMsg.set(this.edgeErr.clave(e, 'admin_invite.err_send'));
      return false;
    } finally {
      this.enviandoInvitacion.set(false);
    }
  }

  /**
   * «Enviar invitación-correo»: manda el correo y además hace lo mismo que
   * «Enviar estimación». La estimación se guarda primero, por dos motivos: el
   * correo sale con los datos recién grabados (visita, problemas observados) y
   * es ese guardado el que pasa el expediente a `estimado`, único estado desde
   * el que la función `enviar-invitacion` acepta invitar.
   */
  async enviarInvitacionYEstimacion() {
    this.errorInvitacionMsg.set('');
    this.exitoInvitacionMsg.set('');
    if (!this.seleccionInvitados().size) {
      this.errorInvitacionMsg.set('admin_invite.err_none');
      return;
    }
    if (!(await this.guardarEstimacion())) {
      this.errorInvitacionMsg.set('admin_invite.err_estimation_first');
      return;
    }
    await this.enviarInvitaciones();
  }

  async guardarVisita() {
    this.errorVisitaMsg.set('');
    this.exitoVisitaMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorVisitaMsg.set('estimator_form.err_visit');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorVisitaMsg.set('estimator_form.err_session'); return; }

    this.guardandoVisita.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId, userId, {
        fechaVisita:          this.fechaVisita,
        horaVisita:           this.horaVisita,
        descripcionProblemas: this.descripcionProblema.trim(),
        costoMin:             this.costoMin,
        costoMax:             this.costoMax,
        notasInternas:        this.notasInternas.trim(),
        urlTour:              EstimacionService.serializeUrls(this.urlsTour()),
      });
      this.hasDraft.set(true);
      this.exitoVisitaMsg.set('estimator_form.success_draft');
    } catch (e: any) {
      console.error('[FileUnderEstimation] guardarVisita:', e.message);
      this.errorVisitaMsg.set(e.message);
    } finally {
      this.guardandoVisita.set(false);
    }
  }

  // ── Archivos ──────────────────────────────────────────────────────────────

  private async cargarArchivos() {
    const { fotos, videos, documentos } = await this.archivoService.cargarTodos(this.expedienteId);
    this.fotos.set(fotos);
    this.videos.set(videos);
    this.documentos.set(documentos);
  }

  private async recargar(tipo: TipoArchivo) {
    const data = await this.archivoService.cargarPorTipo(this.expedienteId, tipo);
    if (tipo === 'foto')      this.fotos.set(data);
    if (tipo === 'documento') this.documentos.set(data);
  }

  async subirFotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
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

  async subirDocumento(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    const userId = this.user()?.id;
    if (!userId) return;
    this.errorDocumentos.set('');
    const err = validateFile(file, FILE_LIMITS.DOCUMENTO.maxBytes, FILE_LIMITS.DOCUMENTO.types);
    if (err) { this.errorDocumentos.set(err); return; }
    this.subiendoDocumento.set(true);
    try {
      await this.archivoService.subir(this.expedienteId, 'documento', file, userId);
      await this.recargar('documento');
    } catch (e: any) { this.errorDocumentos.set(e.message); }
    finally { this.subiendoDocumento.set(false); }
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

  /**
   * Muestra el documento en el navegador (no lo descarga): PDF inline; Office
   * (docx/xlsx/pptx) vía el visor online de Microsoft. Requiere URL pública.
   */
  verDocumento(archivo: ArchivoRow) {
    const url   = this.publicUrl(archivo.url_storage);
    const name  = (archivo.nombre_archivo ?? '').toLowerCase();
    const esPdf = archivo.mime_type === 'application/pdf' || name.endsWith('.pdf');
    if (esPdf) {
      window.open(url, '_blank', 'noopener');
    } else {
      const viewer = 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(url);
      window.open(viewer, '_blank', 'noopener');
    }
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
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'es-CA';
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
      // Shift collapsed indexes: remove deleted, decrement those above it
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

  get servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  volver() { this.router.navigate(['/estimator/files-under-estimation']); }
}
