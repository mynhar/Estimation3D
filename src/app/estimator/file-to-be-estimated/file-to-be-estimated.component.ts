import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import { ExpedienteDetalle, ArchivoRow } from '../../models';

@Component({
  selector: 'app-file-to-be-estimated',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './file-to-be-estimated.component.html',
  styleUrl:    './file-to-be-estimated.component.css',
})
export class FileToBeEstimatedComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  user     = toSignal(this.auth.user$);
  detalle  = signal<ExpedienteDetalle | null>(null);
  cargando = signal(true);
  errorMsg = signal<string>('');

  fechaVisita          = '';
  horaVisita           = '';
  descripcionProblemas = '';
  notasInternas        = '';
  costoEstimado: number | null = null;

  guardando       = signal(false);
  exitoMsg        = signal('');
  errorGuardado   = signal('');
  guardandoVisita = signal(false);
  exitoVisitaMsg  = signal('');
  errorVisitaMsg  = signal('');

  fotos      = signal<ArchivoRow[]>([]);
  videos     = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  subiendoFoto      = signal(false);
  subiendoVideo     = signal(false);
  subiendoDocumento = signal(false);
  errorFotos        = signal('');
  errorVideos       = signal('');
  errorDocumentos   = signal('');

  videoActivo = signal<ArchivoRow | null>(null);

  private expedienteId = '';

  get formularioCompleto(): boolean {
    return !!(
      this.fechaVisita &&
      this.horaVisita &&
      this.descripcionProblemas.trim() &&
      this.costoEstimado !== null &&
      this.costoEstimado >= 0
    );
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
        this.descripcionProblemas = estimacion.descripcion_problemas;
        this.costoEstimado        = estimacion.costo_estimado;
        this.notasInternas        = estimacion.notas_internas;
      } else if (detalle.fecha_visita) {
        this.fechaVisita = detalle.fecha_visita.slice(0, 10);
      }
    } catch (e: any) {
      console.error('[FileToBeEstimated]', e.message);
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
      this.errorGuardado.set('La fecha y hora de visita son obligatorias.');
      return;
    }
    if (!this.descripcionProblemas.trim()) {
      this.errorGuardado.set('Los problemas observados son obligatorios.');
      return;
    }
    if (this.costoEstimado === null || this.costoEstimado < 0) {
      this.errorGuardado.set('El costo estimado es obligatorio y debe ser mayor o igual a 0.');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorGuardado.set('No hay sesión activa.'); return; }

    this.guardando.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId, userId, {
        fechaVisita:          this.fechaVisita,
        horaVisita:           this.horaVisita,
        descripcionProblemas: this.descripcionProblemas.trim(),
        costoEstimado:        this.costoEstimado,
        notasInternas:        this.notasInternas.trim(),
      });
      await this.expedienteService.actualizarEstado(this.expedienteId, 'estimado');
      this.exitoMsg.set('Estimación enviada correctamente.');
    } catch (e: any) {
      console.error('[FileToBeEstimated] guardar:', e.message);
      this.errorGuardado.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  async guardarVisita() {
    this.errorVisitaMsg.set('');
    this.exitoVisitaMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorVisitaMsg.set('La fecha y hora de visita son obligatorias.');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorVisitaMsg.set('No hay sesión activa.'); return; }

    this.guardandoVisita.set(true);
    try {
      await this.estimacionService.guardar(this.expedienteId, userId, {
        fechaVisita:          this.fechaVisita,
        horaVisita:           this.horaVisita,
        descripcionProblemas: this.descripcionProblemas.trim(),
        costoEstimado:        this.costoEstimado ?? 0,
        notasInternas:        this.notasInternas.trim(),
      });
      this.exitoVisitaMsg.set('Borrador guardado correctamente.');
    } catch (e: any) {
      console.error('[FileToBeEstimated] guardarVisita:', e.message);
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
    if (tipo === 'video')     this.videos.set(data);
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

  async subirVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    const userId = this.user()?.id;
    if (!userId) return;
    this.subiendoVideo.set(true);
    this.errorVideos.set('');
    try {
      await this.archivoService.subir(this.expedienteId, 'video', file, userId);
      await this.recargar('video');
    } catch (e: any) { this.errorVideos.set(e.message); }
    finally { this.subiendoVideo.set(false); }
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
    const setError = tipo === 'foto'  ? this.errorFotos
                   : tipo === 'video' ? this.errorVideos
                   :                    this.errorDocumentos;
    setError.set('');
    if (tipo === 'video' && this.videoActivo()?.id === archivo.id) {
      this.videoActivo.set(null);
    }
    try {
      await this.archivoService.eliminar(archivo);
      await this.recargar(tipo);
    } catch (e: any) { setError.set(e.message); }
  }

  toggleVideo(video: ArchivoRow) {
    this.videoActivo.set(this.videoActivo()?.id === video.id ? null : video);
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
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  volver() { this.router.navigate(['/estimator/files-to-be-estimated']); }
}
