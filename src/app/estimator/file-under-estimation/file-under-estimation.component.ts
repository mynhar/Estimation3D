import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import { ExpedienteDetalle, ArchivoRow } from '../../models';

@Component({
  selector: 'app-file-under-estimation',
  standalone: true,
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
  urlTour  = '';

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

  // Tour CRUD
  hasDraft      = signal(false);
  editandoTour  = signal(false);
  guardandoTour = signal(false);
  errorTour     = signal('');
  urlTourInput  = '';

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

  get urlTourSafe(): SafeResourceUrl | null {
    const url = this.urlTour.trim();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  get urlTourPreviewSafe(): SafeResourceUrl | null {
    const url = this.urlTourInput.trim();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
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
        this.urlTour             = estimacion.url_tour ?? '';
        this.hasDraft.set(true);
      }
    } catch (e: any) {
      console.error('[FileUnderEstimation]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }

    this.cargarArchivos();
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

    const userId = this.user()?.id;
    if (!userId) { this.errorGuardado.set('estimator_form.err_session'); return; }

    this.guardando.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId, userId, {
        fechaVisita:          this.fechaVisita,
        horaVisita:           this.horaVisita,
        descripcionProblemas: this.descripcionProblema.trim(),
        costoMin:             this.costoMin,
        costoMax:             this.costoMax,
        notasInternas:        this.notasInternas.trim(),
        urlTour:              this.urlTour.trim() || null,
      });
      await this.expedienteService.actualizarEstado(this.expedienteId, 'estimado');
      this.hasDraft.set(true);
      this.exitoMsg.set('estimator_form.success_estimation');
    } catch (e: any) {
      console.error('[FileUnderEstimation] guardar:', e.message);
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
        urlTour:              this.urlTour.trim() || null,
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
    const { fotos, documentos } = await this.archivoService.cargarTodos(this.expedienteId);
    this.fotos.set(fotos);
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
    this.subiendoFoto.set(true);
    this.errorFotos.set('');
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
    this.subiendoDocumento.set(true);
    this.errorDocumentos.set('');
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

  // ── Tour CRUD ─────────────────────────────────────────────────────────────

  iniciarEdicionTour() {
    this.urlTourInput = this.urlTour;
    this.errorTour.set('');
    this.editandoTour.set(true);
  }

  cancelarEdicionTour() {
    this.editandoTour.set(false);
    this.errorTour.set('');
  }

  async guardarTour() {
    const url = this.urlTourInput.trim() || null;
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasDraft()) {
        await this.estimacionService.actualizarUrlTour(this.expedienteId, url);
      }
      this.urlTour = url ?? '';
      this.editandoTour.set(false);
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  async eliminarTour() {
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasDraft()) {
        await this.estimacionService.actualizarUrlTour(this.expedienteId, null);
      }
      this.urlTour = '';
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  volver() { this.router.navigate(['/estimator/files-under-estimation']); }
}
