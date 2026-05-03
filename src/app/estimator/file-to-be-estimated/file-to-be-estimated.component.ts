import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface ExpedienteDetalle {
  numero: string;
  fecha_visita: string;
  descripcion: string;
  servicio_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
}

interface ArchivoRow {
  id: string;
  nombre_archivo: string;
  url_storage: string;
  mime_type: string;
  tamano_bytes: number;
}

const BUCKET = 'archivos';

@Component({
  selector: 'app-file-to-be-estimated',
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
                  [(ngModel)]="descripcionProblemas"
                ></textarea>
              </div>

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Costo Estimado</label>
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
export class FileToBeEstimatedComponent implements OnInit {
  private auth   = inject(AuthSupabaseService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  detalle  = signal<ExpedienteDetalle | null>(null);
  cargando = signal(true);
  errorMsg = signal<string>('');

  fechaVisita           = '';
  horaVisita            = '';
  descripcionProblemas  = '';
  notasInternas         = '';
  costoEstimado: number | null = null;

  guardando     = signal(false);
  exitoMsg      = signal('');
  errorGuardado = signal('');

  guardandoVisita = signal(false);
  exitoVisitaMsg  = signal('');
  errorVisitaMsg  = signal('');

  fotos      = signal<ArchivoRow[]>([]);
  videos     = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  subiendoFoto      = signal(false);
  subiendoVideo     = signal(false);
  subiendoDocumento = signal(false);

  errorFotos      = signal('');
  errorVideos     = signal('');
  errorDocumentos = signal('');

  private expedienteId = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const { data: exp, error: expError } = await this.auth.client
        .from('expediente')
        .select('numero, fecha_visita, descripcion, cliente_id, servicio_id')
        .eq('id', id)
        .maybeSingle();

      if (expError) throw new Error(`expediente: ${expError.message}`);
      if (!exp) throw new Error('Expediente no encontrado. Verifica RLS en la tabla expediente.');

      const [servicioRes, perfilRes, locRes, estimacionRes] = await Promise.all([
        this.auth.client.from('servicio').select('nombre_es').eq('id', exp.servicio_id).single(),
        this.auth.client.from('perfil').select('nombre, apellido, telefono').eq('id', exp.cliente_id).single(),
        this.auth.client.from('localizacion').select('direccion, referencia, provincia, canton, distrito').eq('expediente_id', id).single(),
        this.auth.client
          .from('estimacion')
          .select('fecha_visita_real, descripcion_problemas, costo_estimado, notas_internas')
          .eq('expediente_id', id)
          .maybeSingle(),
      ]);

      this.detalle.set({
        numero:           exp.numero,
        fecha_visita:     exp.fecha_visita,
        descripcion:      exp.descripcion ?? '',
        servicio_nombre:  servicioRes.data?.nombre_es ?? '—',
        cliente_nombre:   perfilRes.data
          ? `${perfilRes.data.nombre} ${perfilRes.data.apellido}`
          : '—',
        cliente_telefono: perfilRes.data?.telefono ?? '',
        direccion:  locRes.data?.direccion  ?? '—',
        referencia: locRes.data?.referencia ?? '—',
        provincia:  locRes.data?.provincia  ?? '—',
        canton:     locRes.data?.canton     ?? '—',
        distrito:   locRes.data?.distrito   ?? '—',
      });

      const est = estimacionRes.data;
      if (est) {
        if (est.fecha_visita_real) {
          this.fechaVisita = est.fecha_visita_real.slice(0, 10);
          this.horaVisita  = est.fecha_visita_real.slice(11, 16);
        }
        this.descripcionProblemas = est.descripcion_problemas ?? '';
        this.costoEstimado        = est.costo_estimado        ?? null;
        this.notasInternas        = est.notas_internas        ?? '';
      } else if (exp.fecha_visita) {
        this.fechaVisita = exp.fecha_visita.slice(0, 10);
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

    this.guardando.set(true);

    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');

      const fechaVisitaReal = `${this.fechaVisita}T${this.horaVisita}:00`;

      const { error } = await this.auth.client
        .from('estimacion')
        .upsert({
          expediente_id:         this.expedienteId,
          estimador_id:          user.id,
          fecha_visita_real:     fechaVisitaReal,
          descripcion_problemas: this.descripcionProblemas.trim(),
          costo_estimado:        this.costoEstimado,
          notas_internas:        this.notasInternas.trim() || null,
        }, { onConflict: 'expediente_id' });

      if (error) throw new Error(error.message);

      const { error: expError } = await this.auth.client
        .from('expediente')
        .update({ estado: 'estimado' })
        .eq('id', this.expedienteId);

      if (expError) throw new Error(expError.message);

      this.exitoMsg.set('Estimación guardada correctamente.');
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

    this.guardandoVisita.set(true);
    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');

      const { error } = await this.auth.client
        .from('estimacion')
        .upsert({
          expediente_id:         this.expedienteId,
          estimador_id:          user.id,
          fecha_visita_real:     `${this.fechaVisita}T${this.horaVisita}:00`,
          descripcion_problemas: this.descripcionProblemas.trim(),
          costo_estimado:        this.costoEstimado ?? 0,
          notas_internas:        this.notasInternas.trim() || null,
        }, { onConflict: 'expediente_id' });

      if (error) throw new Error(error.message);
      this.exitoVisitaMsg.set('Visita guardada correctamente.');
    } catch (e: any) {
      console.error('[FileToBeEstimated] guardarVisita:', e.message);
      this.errorVisitaMsg.set(e.message);
    } finally {
      this.guardandoVisita.set(false);
    }
  }

  // ----------------------------------------------------------------
  // Archivos
  // ----------------------------------------------------------------

  private async cargarArchivos() {
    const [fotosRes, videosRes, docsRes] = await Promise.all([
      this.auth.client.from('archivo')
        .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
        .eq('expediente_id', this.expedienteId).eq('tipo', 'foto')
        .order('creado_en', { ascending: false }),
      this.auth.client.from('archivo')
        .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
        .eq('expediente_id', this.expedienteId).eq('tipo', 'video')
        .order('creado_en', { ascending: false }),
      this.auth.client.from('archivo')
        .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
        .eq('expediente_id', this.expedienteId).eq('tipo', 'documento')
        .order('creado_en', { ascending: false }),
    ]);
    this.fotos.set(fotosRes.data ?? []);
    this.videos.set(videosRes.data ?? []);
    this.documentos.set(docsRes.data ?? []);
  }

  private async recargarTipo(tipo: 'foto' | 'video' | 'documento') {
    const { data } = await this.auth.client.from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
      .eq('expediente_id', this.expedienteId).eq('tipo', tipo)
      .order('creado_en', { ascending: false });
    if (tipo === 'foto')      this.fotos.set(data ?? []);
    if (tipo === 'video')     this.videos.set(data ?? []);
    if (tipo === 'documento') this.documentos.set(data ?? []);
  }

  private async uploadOne(
    tipo: 'foto' | 'video' | 'documento',
    file: File,
    userId: string
  ): Promise<void> {
    const storagePath = `expedientes/${this.expedienteId}/${tipo}/${Date.now()}_${file.name}`;

    const { error: upErr } = await this.auth.client.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await this.auth.client.from('archivo').insert({
      tipo,
      nombre_archivo: file.name,
      url_storage:    storagePath,
      mime_type:      file.type || 'application/octet-stream',
      tamano_bytes:   file.size,
      subido_por:     userId,
      expediente_id:  this.expedienteId,
    });

    if (dbErr) {
      await this.auth.client.storage.from(BUCKET).remove([storagePath]);
      throw new Error(dbErr.message);
    }
  }

  async subirFotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    this.subiendoFoto.set(true);
    this.errorFotos.set('');
    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');
      for (const file of files) {
        await this.uploadOne('foto', file, user.id);
      }
      await this.recargarTipo('foto');
    } catch (e: any) {
      this.errorFotos.set(e.message);
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  async subirVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.subiendoVideo.set(true);
    this.errorVideos.set('');
    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');
      await this.uploadOne('video', file, user.id);
      await this.recargarTipo('video');
    } catch (e: any) {
      this.errorVideos.set(e.message);
    } finally {
      this.subiendoVideo.set(false);
    }
  }

  async subirDocumento(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.subiendoDocumento.set(true);
    this.errorDocumentos.set('');
    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');
      await this.uploadOne('documento', file, user.id);
      await this.recargarTipo('documento');
    } catch (e: any) {
      this.errorDocumentos.set(e.message);
    } finally {
      this.subiendoDocumento.set(false);
    }
  }

  async eliminarArchivo(archivo: ArchivoRow, tipo: 'foto' | 'video' | 'documento') {
    const setError = tipo === 'foto'  ? this.errorFotos
                   : tipo === 'video' ? this.errorVideos
                   :                    this.errorDocumentos;
    setError.set('');
    try {
      await this.auth.client.storage.from(BUCKET).remove([archivo.url_storage]);
      const { error } = await this.auth.client.from('archivo').delete().eq('id', archivo.id);
      if (error) throw new Error(error.message);
      await this.recargarTipo(tipo);
    } catch (e: any) {
      setError.set(e.message);
    }
  }

  publicUrl(storagePath: string): string {
    return this.auth.client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  // ----------------------------------------------------------------
  // Formato
  // ----------------------------------------------------------------

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  volver() {
    this.router.navigate(['/estimator/files-to-be-estimated']);
  }
}
