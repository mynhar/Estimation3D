import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import { ExpedienteDetalle, EstimacionDetalle, ArchivoRow } from '../../models';

@Component({
  selector: 'app-estimated-file',
  standalone: true,
  imports: [DecimalPipe],
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

        <div class="mb-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-3">
            <button class="btn btn-outline-secondary btn-sm" (click)="volver()">
              ← Volver
            </button>
            <h4 class="fw-semibold mb-0">Estimación completa. Expediente estimado.</h4>
          </div>
          <button class="btn btn-outline-danger btn-sm" title="Imprimir PDF" (click)="imprimir()">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
              <path d="M4.603 14.087a.81.81 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.102.198-.307.526-.568.897-.787a7.68 7.68 0 0 1 1.482-.645 19.697 19.697 0 0 0 1.062-2.227 7.269 7.269 0 0 1-.43-1.295c-.086-.4-.119-.796-.046-1.136.075-.354.274-.672.65-.823.192-.077.4-.12.602-.077a.7.7 0 0 1 .477.365c.088.164.12.356.127.538.007.188-.012.396-.047.614-.084.51-.27 1.134-.52 1.794a10.954 10.954 0 0 0 .98 1.686 5.753 5.753 0 0 1 1.334.05c.364.066.734.195.96.465.12.144.193.32.2.518.007.192-.047.382-.138.563a1.04 1.04 0 0 1-.354.416.856.856 0 0 1-.51.138c-.331-.014-.654-.196-.933-.417a5.712 5.712 0 0 1-.911-.95 11.651 11.651 0 0 0-1.997.406 11.307 11.307 0 0 1-1.02 1.51c-.292.35-.609.656-.927.787a.793.793 0 0 1-.58.029zm1.379-1.901c-.166.076-.32.156-.459.238-.328.194-.541.383-.647.547-.094.145-.096.25-.04.361.01.022.02.036.026.044a.266.266 0 0 0 .035-.012c.137-.056.355-.235.635-.572a8.18 8.18 0 0 0 .45-.606zm1.64-1.33a12.71 12.71 0 0 1 1.01-.193 11.744 11.744 0 0 1-.51-.858 20.801 20.801 0 0 1-.5 1.05zm2.446.45c.15.163.296.3.435.41.24.19.407.253.498.256a.107.107 0 0 0 .07-.015.307.307 0 0 0 .094-.125.436.436 0 0 0 .059-.2.095.095 0 0 0-.026-.063c-.052-.062-.2-.152-.518-.209a3.876 3.876 0 0 0-.612-.053zM8.078 7.8a6.7 6.7 0 0 0 .2-.828c.031-.188.043-.343.038-.465a.613.613 0 0 0-.032-.198.517.517 0 0 0-.145.04c-.087.035-.158.106-.196.283-.04.192-.03.469.046.822.024.111.054.227.09.346z"/>
            </svg>
          </button>
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

        <!-- Documentación de la visita (read-only) -->
        <div class="card border-0 shadow-sm mt-4">
          <div class="card-body p-4">
            <h5 class="fw-semibold mb-4">Documentación de la visita</h5>

            @if (!estimacion()) {
              <p class="text-muted">Sin documentación registrada aún.</p>
            } @else {
              <div class="row g-4">

                <div class="col-sm-6">
                  <p class="text-muted small mb-1">Fecha de visita</p>
                  <p class="fw-semibold mb-0">{{ formatFecha(estimacion()!.fecha_visita_real) }}</p>
                </div>

                <div class="col-sm-6">
                  <p class="text-muted small mb-1">Hora de visita</p>
                  <p class="fw-semibold mb-0">{{ formatHora(estimacion()!.fecha_visita_real) }}</p>
                </div>

                <div class="col-12"><hr class="my-0" /></div>

                <div class="col-12">
                  <p class="text-muted small mb-1">Problemas observados</p>
                  <p class="mb-0" style="white-space: pre-wrap">{{ estimacion()!.descripcion_problemas || '—' }}</p>
                </div>

                <div class="col-sm-6">
                  <p class="text-muted small mb-1">Costo Estimado ($)</p>
                  <p class="fw-semibold mb-0">
                    @if (estimacion()!.costo_estimado !== null) {
                      $ {{ estimacion()!.costo_estimado | number:'1.2-2' }}
                    } @else {
                      —
                    }
                  </p>
                </div>

                <div class="col-12">
                  <p class="text-muted small mb-1">Notas internas</p>
                  <p class="mb-0" style="white-space: pre-wrap">{{ estimacion()!.notas_internas || '—' }}</p>
                </div>

              </div>
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

        <div class="mt-4">
          <button class="btn btn-outline-secondary" (click)="volver()">
            ← Volver
          </button>
        </div>

      }

    </div>
  `,
})
export class EstimatedFileComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  detalle    = signal<ExpedienteDetalle | null>(null);
  estimacion = signal<EstimacionDetalle | null>(null);
  cargando   = signal(true);
  errorMsg   = signal('');

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
      this.estimacion.set(estimacion);
    } catch (e: any) {
      console.error('[EstimatedFile]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }

    this.cargarArchivos();
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

    this.subiendoFoto.set(true);
    this.errorFotos.set('');
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId, 'foto', file, '');
      await this.recargar('foto');
    } catch (e: any) { this.errorFotos.set(e.message); }
    finally { this.subiendoFoto.set(false); }
  }

  async subirVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.subiendoVideo.set(true);
    this.errorVideos.set('');
    try {
      await this.archivoService.subir(this.expedienteId, 'video', file, '');
      await this.recargar('video');
    } catch (e: any) { this.errorVideos.set(e.message); }
    finally { this.subiendoVideo.set(false); }
  }

  async subirDocumento(event: Event) {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.subiendoDocumento.set(true);
    this.errorDocumentos.set('');
    try {
      await this.archivoService.subir(this.expedienteId, 'documento', file, '');
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

  imprimir() {
    const d   = this.detalle();
    const est = this.estimacion();
    if (!d) return;

    const costoStr = est?.costo_estimado != null
      ? `$ ${est.costo_estimado.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

    const docEstimacion = est ? `
      <div class="row g-4">
        <div class="col-6"><p class="text-muted small mb-1">Fecha de visita</p><p class="fw-semibold mb-0">${this.formatFecha(est.fecha_visita_real)}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">Hora de visita</p><p class="fw-semibold mb-0">${this.formatHora(est.fecha_visita_real)}</p></div>
        <div class="col-12"><hr class="my-0"/></div>
        <div class="col-12"><p class="text-muted small mb-1">Problemas observados</p><p class="mb-0" style="white-space:pre-wrap">${est.descripcion_problemas || '—'}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">Costo Estimado ($)</p><p class="fw-semibold mb-0">${costoStr}</p></div>
        <div class="col-12"><p class="text-muted small mb-1">Notas internas</p><p class="mb-0" style="white-space:pre-wrap">${est.notas_internas || '—'}</p></div>
      </div>` : '<p class="text-muted">Sin documentación registrada aún.</p>';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Expediente ${d.numero}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css">
  <style>body{padding:2rem} @page{margin:1.5cm} .card{border:1px solid #dee2e6!important}</style>
</head>
<body>
  <div class="container" style="max-width:720px">
    <h4 class="fw-semibold mb-4">Estimación completa — Expediente ${d.numero}</h4>
    <p class="text-muted mb-4">Estimador: <strong>${d.estimador_nombre}</strong></p>
    <div class="card mb-4"><div class="card-body p-4"><div class="row g-4">
      <div class="col-6"><p class="text-muted small mb-1">Número</p><p class="fw-semibold mb-0">${d.numero}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">Servicio</p><p class="fw-semibold mb-0">${d.servicio_nombre}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-6"><p class="text-muted small mb-1">Cliente</p><p class="fw-semibold mb-0">${d.cliente_nombre}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">Teléfono</p><p class="fw-semibold mb-0">${d.cliente_telefono || '—'}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-6"><p class="text-muted small mb-1">Dirección</p><p class="fw-semibold mb-0">${d.direccion}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">Referencia</p><p class="fw-semibold mb-0">${d.referencia}</p></div>
      <div class="col-4"><p class="text-muted small mb-1">Provincia</p><p class="fw-semibold mb-0">${d.provincia}</p></div>
      <div class="col-4"><p class="text-muted small mb-1">Cantón</p><p class="fw-semibold mb-0">${d.canton}</p></div>
      <div class="col-4"><p class="text-muted small mb-1">Distrito</p><p class="fw-semibold mb-0">${d.distrito}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-6"><p class="text-muted small mb-1">Fecha de visita</p><p class="fw-semibold mb-0">${this.formatFecha(d.fecha_visita)}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">Hora de visita</p><p class="fw-semibold mb-0">${this.formatHora(d.fecha_visita)}</p></div>
    </div></div></div>
    <div class="card"><div class="card-body p-4">
      <h5 class="fw-semibold mb-4">Documentación de la visita</h5>
      ${docEstimacion}
    </div></div>
  </div>
  <script>window.addEventListener('load',()=>window.print())</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  volver() { this.router.navigate(['/estimator/estimated-files']); }
}
