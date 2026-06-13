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

  get servicioNombre(): string {
    const d    = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
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

    const t        = (key: string) => this.translate.instant(key);
    const now      = new Date();
    const printDate = this.formatFecha(now.toISOString());
    const lang     = this.translate.currentLang ?? 'es';

    const costoMinStr = this.formatCosto(est?.costo_estimado ?? null);
    const costoMaxStr = this.formatCosto(est?.costo_estimado_max ?? null);
    const hasCosto    = est?.costo_estimado != null;
    const hasMax      = est?.costo_estimado_max != null;

    const costBlock = hasCosto ? `
      <div class="cost-block">
        <div class="cost-block__bar"></div>
        <p class="cost-block__label">${t('file.estimated_cost')}</p>
        <div class="cost-block__row">
          <div class="cost-item">
            <span class="cost-item__tag">${t('common.min') || 'Mín'}</span>
            <span class="cost-item__value">${costoMinStr}</span>
          </div>
          ${hasMax ? `<div class="cost-item__sep">→</div>
          <div class="cost-item">
            <span class="cost-item__tag">${t('common.max') || 'Máx'}</span>
            <span class="cost-item__value">${costoMaxStr}</span>
          </div>` : ''}
        </div>
      </div>` : '';

    const visitSection = est ? `
      <div class="section">
        <h3 class="section__title">${t('estimator_file.estimation_doc_title')}</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-item__label">${t('estimator_file.real_visit_date')}</span>
            <span class="info-item__value">${this.formatFecha(est.fecha_visita_real)}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">${t('estimator_file.check_visit_time')}</span>
            <span class="info-item__value">${this.formatHora(est.fecha_visita_real)}</span>
          </div>
        </div>
        ${est.descripcion_problemas ? `
        <div class="prose-block">
          <p class="prose-block__label">${t('estimator_file.problems_observed')}</p>
          <p class="prose-block__text">${est.descripcion_problemas.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
        ${est.notas_internas ? `
        <div class="prose-block">
          <p class="prose-block__label">${t('estimator_file.internal_notes')}</p>
          <p class="prose-block__text">${est.notas_internas.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
      </div>` : `
      <div class="section">
        <h3 class="section__title">${t('estimator_file.estimation_doc_title')}</h3>
        <p class="empty-note">${t('estimator_file.print_no_doc')}</p>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t('file.exp_abbr')} ${d.numero} — Estimation3D</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 2cm; }
    /* Documento PDF independiente (ventana/print propios): NO puede leer
       var(--ds-*) de la app. El hex aquí es intencional; los valores se
       mantienen alineados a la paleta canónica de src/styles/tokens.css. */
    :root {
      --gold:        #D4B96E;  /* --ds-gold */
      --gold-faint:  #F7EFD9;  /* --ds-gold-faint */
      --gold-soft:   #EBD9A8;  /* --ds-gold-soft */
      --ink:         #1A1A1A;  /* --ds-ink */
      --ink-2:       #4A4A4A;  /* --ds-ink-secondary */
      --ink-3:       #7A7770;  /* --ds-ink-muted */
      --surface:     #FBFAF6;  /* --ds-surface */
      --border:      #E8E5DC;  /* --ds-border */
      --bg:          #F5F3EE;  /* --ds-bg */
      --ff-display:  'Fraunces', Georgia, serif;
      --ff-body:     'DM Sans', system-ui, sans-serif;
    }
    body {
      font-family: var(--ff-body);
      font-size: 11pt;
      color: var(--ink);
      background: #fff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* ── Letterhead ── */
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 14px;
      border-bottom: 3px solid var(--gold);
      margin-bottom: 28px;
    }
    .letterhead__brand { font-family: var(--ff-display); font-size: 22pt; font-weight: 300; color: var(--ink); letter-spacing: -0.5px; }
    .letterhead__brand span { font-weight: 600; color: var(--gold); }
    .letterhead__meta { text-align: right; font-size: 8.5pt; color: var(--ink-3); line-height: 1.6; }
    .letterhead__meta strong { color: var(--ink-2); font-weight: 500; }
    /* ── Title block ── */
    .title-block {
      display: flex;
      align-items: stretch;
      gap: 14px;
      margin-bottom: 24px;
    }
    .title-block__bar { width: 4px; background: var(--gold); border-radius: 2px; flex-shrink: 0; }
    .title-block__eyebrow { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-3); margin-bottom: 4px; }
    .title-block__name { font-family: var(--ff-display); font-size: 18pt; font-weight: 300; color: var(--ink); line-height: 1.2; }
    .title-block__badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 7.5pt; font-weight: 500; border: 1px solid var(--border); color: var(--ink-2); background: var(--bg); }
    .badge--gold { background: var(--gold-faint); border-color: var(--gold-soft); color: var(--ink); }
    /* ── Sections ── */
    .section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; margin-bottom: 16px; }
    .section__title { font-family: var(--ff-display); font-size: 11pt; font-weight: 400; color: var(--ink); margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    /* ── Info grid ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
    .info-grid--wide { grid-template-columns: 2fr 1fr 1fr; }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-item__label { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-3); }
    .info-item__value { font-size: 10pt; font-weight: 500; color: var(--ink); }
    .info-item--full { grid-column: 1 / -1; }
    .info-divider { grid-column: 1 / -1; height: 1px; background: var(--border); }
    /* ── Cost block ── */
    .cost-block {
      position: relative;
      background: var(--gold-faint);
      border: 1px solid var(--gold-soft);
      border-radius: 8px;
      padding: 20px 22px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .cost-block__bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--gold); }
    .cost-block__label { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-3); margin-bottom: 10px; }
    .cost-block__row { display: flex; align-items: center; gap: 20px; }
    .cost-item { display: flex; flex-direction: column; gap: 2px; }
    .cost-item__tag { font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-3); }
    .cost-item__value { font-family: var(--ff-display); font-size: 20pt; font-weight: 300; color: var(--ink); line-height: 1; }
    .cost-item__sep { font-size: 14pt; color: var(--gold); font-weight: 300; align-self: flex-end; margin-bottom: 4px; }
    /* ── Prose blocks ── */
    .prose-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
    .prose-block__label { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-3); margin-bottom: 6px; }
    .prose-block__text { font-size: 10pt; color: var(--ink-2); line-height: 1.6; }
    /* ── Footer ── */
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5pt;
      color: var(--ink-3);
    }
    .footer__brand { font-family: var(--ff-display); font-size: 9pt; color: var(--ink-3); font-weight: 300; }
    .footer__brand span { color: var(--gold); }
    .empty-note { font-size: 10pt; color: var(--ink-3); font-style: italic; }
    /* ── Print ── */
    @media print {
      body { background: #fff; }
      .section { break-inside: avoid; }
      .cost-block { break-inside: avoid; }
      .title-block { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="letterhead">
    <div class="letterhead__brand">Estimation<span>3D</span></div>
    <div class="letterhead__meta">
      <strong>${t('file.exp_abbr')} ${d.numero}</strong><br>
      ${printDate}
    </div>
  </header>

  <div class="title-block">
    <div class="title-block__bar"></div>
    <div>
      <p class="title-block__eyebrow">${t('file.service')}</p>
      <h1 class="title-block__name">${this.servicioNombre}</h1>
      <div class="title-block__badges">
        <span class="badge badge--gold">${t('file.exp_abbr')} ${d.numero}</span>
        <span class="badge">${d.estado}</span>
        <span class="badge">${t('role.estimador')}: ${d.estimador_nombre}</span>
      </div>
    </div>
  </div>

  ${costBlock}

  <div class="section">
    <h3 class="section__title">${t('builder_offer.client_label')}</h3>
    <div class="info-grid info-grid--wide">
      <div class="info-item">
        <span class="info-item__label">${t('builder_offer.client_label')}</span>
        <span class="info-item__value">${d.cliente_nombre}</span>
      </div>
      <div class="info-item">
        <span class="info-item__label">${t('common.phone')}</span>
        <span class="info-item__value">${d.cliente_telefono || '—'}</span>
      </div>
      <div class="info-item">
        <span class="info-item__label">${t('file.reference')}</span>
        <span class="info-item__value">${d.referencia || '—'}</span>
      </div>
      <div class="info-divider"></div>
      <div class="info-item info-item--full">
        <span class="info-item__label">${t('common.address')}</span>
        <span class="info-item__value">${d.direccion}, ${d.canton}, ${d.provincia}</span>
      </div>
      <div class="info-divider"></div>
      <div class="info-item">
        <span class="info-item__label">${t('estimator_file.scheduled_visit')}</span>
        <span class="info-item__value">${this.formatFecha(d.fecha_visita)}</span>
      </div>
      <div class="info-item">
        <span class="info-item__label">${t('estimator_file.check_visit_time')}</span>
        <span class="info-item__value">${this.formatHora(d.fecha_visita)}</span>
      </div>
    </div>
  </div>

  ${visitSection}

  <footer class="footer">
    <span class="footer__brand">Estimation<span>3D</span></span>
    <span>${t('estimator_file.print_estimation_completed')} · ${printDate}</span>
  </footer>

  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 400); })</script>
</body>
</html>`;

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
