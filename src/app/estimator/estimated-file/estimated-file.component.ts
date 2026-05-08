import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import {
  ExpedienteDetalle,
  EstimacionDetalle,
  ArchivoRow,
} from '../../models';

@Component({
  selector: 'app-estimated-file',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './estimated-file.component.html',
  styleUrl:    './estimated-file.component.css',
})
export class EstimatedFileComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
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

  videoActivo = signal<ArchivoRow | null>(null);

  private expedienteId = '';
  private userId       = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    const { data: { user } } = await this.auth.client.auth.getUser();
    this.userId = user?.id ?? '';

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
      for (const file of files) await this.archivoService.subir(this.expedienteId, 'foto', file, this.userId);
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
      await this.archivoService.subir(this.expedienteId, 'video', file, this.userId);
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
      await this.archivoService.subir(this.expedienteId, 'documento', file, this.userId);
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

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  toggleVideo(video: ArchivoRow) {
    this.videoActivo.set(this.videoActivo()?.id === video.id ? null : video);
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
    if (valor.includes('T')) {
      const time = valor.split('T')[1]?.slice(0, 5);
      return time ?? '—';
    }
    return '—';
  }

  imprimir() {
    const d   = this.detalle();
    const est = this.estimacion();
    if (!d) return;

    const costoStr = est?.costo_estimado != null
      ? `₡ ${est.costo_estimado.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

    const docEstimacion = est ? `
      <div class="row g-4">
        <div class="col-6"><p class="text-muted small mb-1">Fecha de visita real</p><p class="fw-semibold mb-0">${this.formatFecha(est.fecha_visita_real)}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">Hora de visita</p><p class="fw-semibold mb-0">${this.formatHora(est.fecha_visita_real)}</p></div>
        <div class="col-12"><hr class="my-0"/></div>
        <div class="col-12"><p class="text-muted small mb-1">Problemas observados</p><p class="mb-0" style="white-space:pre-wrap">${est.descripcion_problemas || '—'}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">Costo estimado (₡)</p><p class="fw-semibold mb-0">${costoStr}</p></div>
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
    <h4 class="fw-semibold mb-1">Expediente ${d.numero} — Estimación completada</h4>
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
      <div class="col-6"><p class="text-muted small mb-1">Fecha de visita programada</p><p class="fw-semibold mb-0">${this.formatFecha(d.fecha_visita)}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">Hora de visita</p><p class="fw-semibold mb-0">${this.formatHora(d.fecha_visita)}</p></div>
    </div></div></div>
    <div class="card"><div class="card-body p-4">
      <h5 class="fw-semibold mb-4">Documentación de la estimación</h5>
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
