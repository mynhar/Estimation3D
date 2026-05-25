import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService, TipoArchivo } from '../../services/archivo.service';
import {
  ExpedienteDetalle,
  EstimacionDetalle,
  ArchivoRow,
  ESTADO_BADGE_ESTIMADOR,
} from '../../models';

@Component({
  selector: 'app-estimated-file',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './estimated-file.component.html',
  styleUrl:    './estimated-file.component.css',
})
export class EstimatedFileComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
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
  documentos = signal<ArchivoRow[]>([]);

  subiendoFoto      = signal(false);
  subiendoDocumento = signal(false);
  errorFotos        = signal('');
  errorDocumentos   = signal('');

  // Tour multi-video
  urlsTour         = signal<string[]>([]);
  expandedIndex    = signal<number | null>(null);
  editandoIndex    = signal<number | null>(null);
  editandoUrlTemp  = '';
  mostrandoFormAdd = signal(false);
  nuevoUrlInput    = '';
  guardandoTour    = signal(false);
  errorTour        = signal('');

  // Eliminar estimación
  confirmandoEliminar = signal(false);
  eliminando          = signal(false);
  errorEliminar       = signal('');

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
      this.urlsTour.set(EstimacionService.parseUrls(estimacion?.url_tour ?? null));
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

    this.subiendoFoto.set(true);
    this.errorFotos.set('');
    try {
      for (const file of files) await this.archivoService.subir(this.expedienteId, 'foto', file, this.userId);
      await this.recargar('foto');
    } catch (e: any) { this.errorFotos.set(e.message); }
    finally { this.subiendoFoto.set(false); }
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
    const setError = tipo === 'foto' ? this.errorFotos : this.errorDocumentos;
    setError.set('');
    try {
      await this.archivoService.eliminar(archivo);
      await this.recargar(tipo);
    } catch (e: any) { setError.set(e.message); }
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
      await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
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
      await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
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
      await this.estimacionService.actualizarUrlsTour(this.expedienteId, nuevaLista);
      this.urlsTour.set(nuevaLista);
      if (this.expandedIndex() === i) this.expandedIndex.set(null);
      if (this.editandoIndex() === i) { this.editandoIndex.set(null); this.editandoUrlTemp = ''; }
    } catch (e: any) {
      this.errorTour.set(e.message);
    } finally {
      this.guardandoTour.set(false);
    }
  }

  toggleExpandVideo(i: number) {
    this.expandedIndex.set(this.expandedIndex() === i ? null : i);
  }

  badgeClass(estado: string | undefined): string {
    return ESTADO_BADGE_ESTIMADOR[estado ?? ''] ?? 'bg-light text-dark';
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
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
    if (valor.includes('T')) {
      const time = valor.split('T')[1]?.slice(0, 5);
      return time ?? '—';
    }
    return '—';
  }

  private formatDireccionCA(d: ExpedienteDetalle): string {
    const country = this.translate.instant('footer.country').toUpperCase();
    return `<p class="fw-semibold mb-0">${d.direccion}</p>`
         + `<p class="fw-semibold mb-0">${d.canton} ${d.provincia} ${d.distrito}</p>`
         + `<p class="fw-bold text-uppercase mb-0 small">${country}</p>`;
  }

  imprimir() {
    const d   = this.detalle();
    const est = this.estimacion();
    if (!d) return;

    const t = (key: string) => this.translate.instant(key);
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'es-CR';

    const costoStr = est?.costo_estimado != null
      ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'CRC' }).format(est.costo_estimado)
      : '—';

    const docEstimacion = est ? `
      <div class="row g-4">
        <div class="col-6"><p class="text-muted small mb-1">${t('estimator_file.real_visit_date')}</p><p class="fw-semibold mb-0">${this.formatFecha(est.fecha_visita_real)}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">${t('estimator_file.check_visit_time')}</p><p class="fw-semibold mb-0">${this.formatHora(est.fecha_visita_real)}</p></div>
        <div class="col-12"><hr class="my-0"/></div>
        <div class="col-12"><p class="text-muted small mb-1">${t('estimator_file.problems_observed')}</p><p class="mb-0" style="white-space:pre-wrap">${est.descripcion_problemas || '—'}</p></div>
        <div class="col-6"><p class="text-muted small mb-1">${t('file.estimated_cost')}</p><p class="fw-semibold mb-0">${costoStr}</p></div>
        <div class="col-12"><p class="text-muted small mb-1">${t('estimator_file.internal_notes')}</p><p class="mb-0" style="white-space:pre-wrap">${est.notas_internas || '—'}</p></div>
      </div>` : `<p class="text-muted">${t('estimator_file.print_no_doc')}</p>`;

    const html = `<!DOCTYPE html>
<html lang="${this.translate.currentLang}">
<head>
  <meta charset="UTF-8">
  <title>${t('file.exp_abbr')} ${d.numero}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css">
  <style>body{padding:2rem} @page{margin:1.5cm} .card{border:1px solid #dee2e6!important}</style>
</head>
<body>
  <div class="container" style="max-width:720px">
    <h4 class="fw-semibold mb-1">${t('file.exp_abbr')} ${d.numero} — ${t('estimator_file.print_estimation_completed')}</h4>
    <p class="text-muted mb-4">${t('role.estimador')}: <strong>${d.estimador_nombre}</strong></p>
    <div class="card mb-4"><div class="card-body p-4"><div class="row g-4">
      <div class="col-6"><p class="text-muted small mb-1">${t('file.number')}</p><p class="fw-semibold mb-0">${d.numero}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">${t('file.service')}</p><p class="fw-semibold mb-0">${d.servicio_nombre}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-6"><p class="text-muted small mb-1">${t('builder_offer.client_label')}</p><p class="fw-semibold mb-0">${d.cliente_nombre}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">${t('common.phone')}</p><p class="fw-semibold mb-0">${d.cliente_telefono || '—'}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-8"><p class="text-muted small mb-1">${t('common.address')}</p>${this.formatDireccionCA(d)}</div>
      <div class="col-4"><p class="text-muted small mb-1">${t('file.reference')}</p><p class="fw-semibold mb-0">${d.referencia || '—'}</p></div>
      <div class="col-12"><hr class="my-0"/></div>
      <div class="col-6"><p class="text-muted small mb-1">${t('estimator_file.scheduled_visit')}</p><p class="fw-semibold mb-0">${this.formatFecha(d.fecha_visita)}</p></div>
      <div class="col-6"><p class="text-muted small mb-1">${t('estimator_file.check_visit_time')}</p><p class="fw-semibold mb-0">${this.formatHora(d.fecha_visita)}</p></div>
    </div></div></div>
    <div class="card"><div class="card-body p-4">
      <h5 class="fw-semibold mb-4">${t('estimator_file.estimation_doc_title')}</h5>
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

  async eliminarEstimacion() {
    const estado = this.detalle()?.estado;
    if (estado === 'adjudicado' || estado === 'contratado') return;
    this.errorEliminar.set('');
    this.eliminando.set(true);
    try {
      await this.estimacionService.eliminar(this.expedienteId);
      await this.expedienteService.actualizarEstado(this.expedienteId, 'nuevo');
      this.router.navigate(['/estimator/estimated-files']);
    } catch (e: any) {
      console.error('[EstimatedFile] eliminar:', e.message);
      this.errorEliminar.set(e.message);
    } finally {
      this.eliminando.set(false);
    }
  }

  volver() { this.router.navigate(['/estimator/estimated-files']); }
}
