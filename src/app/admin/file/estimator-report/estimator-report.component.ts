import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../../services/archivo.service';
import { PerfilRepository, PerfilNombre } from '../../../data/perfil.repository';
import { ArchivoRow } from '../../../models';
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

  /** Id del expediente cuyo informe se edita. */
  expedienteId = input.required<string>();
  /** Estado actual del expediente (lo mantiene el padre). */
  estado = input<string>('');

  /** El guardado asignó estimador a un expediente 'nuevo' → 'en_estimacion'. */
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

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.cargarEstimadores();
    await Promise.all([
      this.cargarEstimadorAsignado(),
      this.cargarEstimacion(),
      this.cargarArchivos(),
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

  // ── Guardar informe ────────────────────────────────────────────────────────
  async guardarEstimacion() {
    this.exitoEst.set(false);
    this.errorEst.set('');

    if (!this.fechaVisitaReal || !this.horaVisitaReal) {
      this.errorEst.set('estimator_form.err_visit');
      return;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorEst.set('estimator_form.err_problems');
      return;
    }
    if (!this.costoValido) {
      this.errorEst.set('estimator_form.err_cost');
      return;
    }
    const estimadorId = this.estimadorSeleccionadoId();
    if (!estimadorId) {
      this.errorEst.set('admin_estimate.err_estimador');
      return;
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
      // Asigna el estimador al expediente solo si aún es 'nuevo' (evita
      // retroceder el estado de un expediente ya avanzado).
      if (this.estado() === 'nuevo') {
        await this.expedienteService.asignarEstimador(this.expedienteId(), estimadorId);
        this.estadoChange.emit('en_estimacion');
      }
      const est = this.estimadores().find(x => x.id === estimadorId);
      if (est) this.estimadorAsignado.emit(`${est.nombre} ${est.apellido}`.trim());
      this.hasEstimacion.set(true);
      this.exitoEst.set(true);
    } catch (e: any) {
      this.errorEst.set(e.message ?? 'admin_file_edit.save_error');
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
