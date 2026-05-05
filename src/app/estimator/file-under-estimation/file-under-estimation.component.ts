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
  selector: 'app-file-under-estimation',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="container py-4" style="max-width: 720px">

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expediente…</div>
      } @else if (!detalle()) {
        <div class="alert alert-warning">
          No se encontró el expediente.
          @if (errorMsg()) {
            <br/><small class="text-danger">{{ errorMsg() }}</small>
          }
        </div>
      } @else {

        <div class="mb-4 d-flex align-items-center gap-3">
          <button class="btn btn-outline-secondary btn-sm" (click)="volver()">
            ← Volver
          </button>
          <h4 class="fw-semibold mb-0">Estimar Expediente</h4>
        </div>

        <!-- Detalles del expediente -->
        <div class="card border-0 shadow-sm">
          <div class="card-body p-4">
            <div class="row g-4">

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Número</p>
                <p class="fw-semibold mb-0">{{ detalle()!.numero }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Servicio</p>
                <p class="fw-semibold mb-0">{{ detalle()!.servicio_nombre }}</p>
              </div>

              <div class="col-12"><hr class="my-0" /></div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Cliente</p>
                <p class="fw-semibold mb-0">{{ detalle()!.cliente_nombre }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Teléfono</p>
                <p class="fw-semibold mb-0">{{ detalle()!.cliente_telefono || '—' }}</p>
              </div>

              <div class="col-12"><hr class="my-0" /></div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Dirección</p>
                <p class="fw-semibold mb-0">{{ detalle()!.direccion }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Referencia</p>
                <p class="fw-semibold mb-0">{{ detalle()!.referencia }}</p>
              </div>

              <div class="col-sm-4">
                <p class="text-muted small mb-1">Provincia</p>
                <p class="fw-semibold mb-0">{{ detalle()!.provincia }}</p>
              </div>

              <div class="col-sm-4">
                <p class="text-muted small mb-1">Cantón</p>
                <p class="fw-semibold mb-0">{{ detalle()!.canton }}</p>
              </div>

              <div class="col-sm-4">
                <p class="text-muted small mb-1">Distrito</p>
                <p class="fw-semibold mb-0">{{ detalle()!.distrito }}</p>
              </div>

              <div class="col-12"><hr class="my-0" /></div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Fecha de visita</p>
                <p class="fw-semibold mb-0">{{ formatFecha(detalle()!.fecha_visita) }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Hora de visita</p>
                <p class="fw-semibold mb-0">{{ formatHora(detalle()!.fecha_visita) }}</p>
              </div>

            </div>
          </div>
        </div>

        <!-- Formulario de estimación -->
        <div class="card border-0 shadow-sm mt-4">
          <div class="card-body p-4">
            <div class="d-flex align-items-center justify-content-between mb-4">
              <h5 class="fw-semibold mb-0">Documentación de la visita</h5>
              <button
                class="btn btn-secondary btn-sm px-3"
                (click)="guardarVisita()"
                [disabled]="guardandoVisita()"
              >
                {{ guardandoVisita() ? 'Guardando…' : 'Guardar visita' }}
              </button>
            </div>

            <div class="row g-3">

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Fecha de visita</label>
                <input
                  type="date"
                  class="form-control"
                  [(ngModel)]="fechaVisita"
                />
              </div>

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Hora de visita</label>
                <input
                  type="time"
                  class="form-control"
                  [(ngModel)]="horaVisita"
                />
              </div>

              <div class="col-12">
                <label class="form-label small fw-medium">Problemas observados</label>
                <textarea
                  class="form-control"
                  rows="4"
                  placeholder="Describa los problemas observados durante la visita…"
                  [(ngModel)]="descripcionProblema"
                ></textarea>
              </div>

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Costo Estimado ($)</label>
                <div class="input-group">
                  <span class="input-group-text">$</span>
                  <input
                    type="number"
                    class="form-control"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    [(ngModel)]="costoEstimado"
                  />
                </div>
              </div>

              <div class="col-12">
                <label class="form-label small fw-medium">Notas internas</label>
                <textarea
                  class="form-control"
                  rows="3"
                  placeholder="Notas solo visibles para el estimador y administrador…"
                  [(ngModel)]="notasInternas"
                ></textarea>
              </div>

            </div>

            @if (errorVisitaMsg()) {
              <div class="alert alert-danger mt-3 mb-0">{{ errorVisitaMsg() }}</div>
            }
            @if (exitoVisitaMsg()) {
              <div class="alert alert-success mt-3 mb-0">{{ exitoVisitaMsg() }}</div>
            }

          </div>
        </div>

        <!-- Sección: Subir archivos -->
        <div class="card border-0 shadow-sm mt-4">
          <div class="card-body p-4">
            <h5 class="fw-semibold mb-4">Subir archivos</h5>

            <!-- Fotos del sitio -->
            <div class="mb-2">
              <div class="d-flex align-items-center gap-3 mb-3">
                <h6 class="fw-medium mb-0">Fotos del sitio</h6>
                <label class="btn btn-outline-primary btn-sm mb-0"
                       [class.disabled]="subiendoFoto()">
                  {{ subiendoFoto() ? 'Subiendo…' : '+ Subir fotos' }}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    class="d-none"
                    (change)="subirFotos($event)"
                    [disabled]="subiendoFoto()"
                  />
                </label>
              </div>
              @if (errorFotos()) {
                <div class="alert alert-danger py-2 small mb-2">{{ errorFotos() }}</div>
              }
              @if (fotos().length === 0) {
                <p class="text-muted small mb-0">Sin fotos aún.</p>
              } @else {
                <div class="d-flex flex-wrap gap-2">
                  @for (f of fotos(); track f.id) {
                    <div class="position-relative" style="width:96px">
                      <img
                        [src]="publicUrl(f.url_storage)"
                        class="rounded border"
                        style="width:96px;height:96px;object-fit:cover;cursor:pointer"
                        [title]="f.nombre_archivo"
                        (click)="verArchivo(f)"
                      />
                      <button
                        class="btn btn-danger position-absolute top-0 end-0 p-0 lh-1 border-0"
                        style="width:20px;height:20px;font-size:12px;border-radius:50%"
                        title="Eliminar"
                        (click)="eliminarArchivo(f, 'foto')"
                      >×</button>
                    </div>
                  }
                </div>
              }
            </div>

            <hr class="my-4" />

            <!-- Videos de la visita -->
            <div class="mb-2">
              <div class="d-flex align-items-center gap-3 mb-3">
                <h6 class="fw-medium mb-0">Videos de la visita</h6>
                <label class="btn btn-outline-primary btn-sm mb-0"
                       [class.disabled]="subiendoVideo()">
                  {{ subiendoVideo() ? 'Subiendo…' : '+ Subir video' }}
                  <input
                    type="file"
                    accept="video/*"
                    class="d-none"
                    (change)="subirVideo($event)"
                    [disabled]="subiendoVideo()"
                  />
                </label>
              </div>
              @if (errorVideos()) {
                <div class="alert alert-danger py-2 small mb-2">{{ errorVideos() }}</div>
              }
              @if (videos().length === 0) {
                <p class="text-muted small mb-0">Sin videos aún.</p>
              } @else {
                <ul class="list-group list-group-flush">
                  @for (v of videos(); track v.id) {
                    <li class="list-group-item px-0 d-flex align-items-center justify-content-between">
                      <div>
                        <span class="fw-medium small">{{ v.nombre_archivo }}</span>
                        <span class="text-muted small ms-2">{{ formatTamano(v.tamano_bytes) }}</span>
                      </div>
                      <div class="d-flex gap-2 flex-shrink-0 ms-2">
                        <button class="btn btn-outline-secondary btn-sm"
                                (click)="verArchivo(v)">Ver</button>
                        <button class="btn btn-outline-danger btn-sm"
                                (click)="eliminarArchivo(v, 'video')">Eliminar</button>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>

            <hr class="my-4" />

            <!-- Documentos técnicos -->
            <div>
              <div class="d-flex align-items-center gap-3 mb-3">
                <h6 class="fw-medium mb-0">Documentos técnicos</h6>
                <label class="btn btn-outline-primary btn-sm mb-0"
                       [class.disabled]="subiendoDocumento()">
                  {{ subiendoDocumento() ? 'Subiendo…' : '+ Subir documento' }}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    class="d-none"
                    (change)="subirDocumento($event)"
                    [disabled]="subiendoDocumento()"
                  />
                </label>
              </div>
              @if (errorDocumentos()) {
                <div class="alert alert-danger py-2 small mb-2">{{ errorDocumentos() }}</div>
              }
              @if (documentos().length === 0) {
                <p class="text-muted small mb-0">Sin documentos aún.</p>
              } @else {
                <ul class="list-group list-group-flush">
                  @for (d of documentos(); track d.id) {
                    <li class="list-group-item px-0 d-flex align-items-center justify-content-between">
                      <div>
                        <span class="fw-medium small">{{ d.nombre_archivo }}</span>
                        <span class="text-muted small ms-2">{{ formatTamano(d.tamano_bytes) }}</span>
                      </div>
                      <div class="d-flex gap-2 flex-shrink-0 ms-2">
                        <button class="btn btn-outline-secondary btn-sm"
                                (click)="verArchivo(d)">Ver</button>
                        <button class="btn btn-outline-danger btn-sm"
                                (click)="eliminarArchivo(d, 'documento')">Eliminar</button>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>

          </div>
        </div>

        <!-- Alertas y acciones -->
        @if (errorGuardado()) {
          <div class="alert alert-danger mt-4">{{ errorGuardado() }}</div>
        }
        @if (exitoMsg()) {
          <div class="alert alert-success mt-4">{{ exitoMsg() }}</div>
        }

        <div class="mt-4 d-flex gap-3">
          <button
            class="btn btn-primary px-4"
            (click)="guardarEstimacion()"
            [disabled]="guardando()"
          >
            {{ guardando() ? 'Enviando…' : 'Enviar estimación' }}
          </button>
          <button class="btn btn-outline-secondary px-4" (click)="volver()">
            Volver
          </button>
        </div>

      }

    </div>
  `,
})
export class FileUnderEstimationComponent implements OnInit {
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

  fechaVisita         = '';
  horaVisita          = '';
  descripcionProblema = '';   // nombre original conservado (sin 's')
  notasInternas       = '';
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

  private expedienteId = '';

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
        this.costoEstimado       = estimacion.costo_estimado;
        this.notasInternas       = estimacion.notas_internas;
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
      this.errorGuardado.set('La fecha y hora de visita son obligatorias.');
      return;
    }
    if (!this.descripcionProblema.trim()) {
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
        descripcionProblemas: this.descripcionProblema.trim(),
        costoEstimado:        this.costoEstimado,
        notasInternas:        this.notasInternas.trim(),
      });
      await this.expedienteService.actualizarEstado(this.expedienteId, 'estimado');
      this.exitoMsg.set('Estimación guardada correctamente.');
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
        descripcionProblemas: this.descripcionProblema.trim(),
        costoEstimado:        this.costoEstimado ?? 0,
        notasInternas:        this.notasInternas.trim(),
      });
      this.exitoVisitaMsg.set('Visita guardada correctamente.');
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
    return new Date(valor).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  volver() { this.router.navigate(['/estimator/files-under-estimation']); }
}
