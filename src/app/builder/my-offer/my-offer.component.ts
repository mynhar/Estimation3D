import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import { ArchivoRow, OfertaDetalle, ESTADO_BADGE_OFERTA } from '../../models';

@Component({
  selector: 'app-my-offer',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './my-offer.component.html',
  styleUrl: './my-offer.component.css',
})
export class MyOfferComponent implements OnInit {
  private ofertaService  = inject(OfertaService);
  private archivoService = inject(ArchivoService);
  private sanitizer      = inject(DomSanitizer);
  private translate      = inject(TranslateService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);

  detalle    = signal<OfertaDetalle | null>(null);
  documentos = signal<ArchivoRow[]>([]);
  videos     = signal<ArchivoRow[]>([]);
  cargando   = signal(true);
  errorMsg   = signal('');

  // Archivos del expediente
  fotosExp      = signal<ArchivoRow[]>([]);
  documentosExp = signal<ArchivoRow[]>([]);
  tabMedia      = signal<'tour' | 'fotos' | 'docs'>('tour');

  // Lightbox
  fotoAmpliada = signal<string | null>(null);

  videoActivo = signal<ArchivoRow | null>(null);

  private ofertaId = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.ofertaId = id;

    try {
      const [detalle, archivosOferta] = await Promise.all([
        this.ofertaService.getOferta(id),
        this.archivoService.cargarPorOferta(id),
      ]);
      this.detalle.set(detalle);
      this.documentos.set(archivosOferta.documentos);
      this.videos.set(archivosOferta.videos);

      // Archivos del expediente — leer desde Storage para evitar RLS de la tabla
      const archivosExp = await this.archivoService.listarPorExpediente(detalle.expediente_id);
      this.fotosExp.set(archivosExp.fotos);
      this.documentosExp.set(archivosExp.documentos);
    } catch (e: any) {
      console.error('[MyOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  get urlsTour(): string[] {
    const raw = this.detalle()?.url_tour ?? null;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch {}
    return [raw];
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  badgeClass(estado: string): string {
    return ESTADO_BADGE_OFERTA[estado] ?? 'bg-light text-dark';
  }

  toggleVideo(video: ArchivoRow) {
    this.videoActivo.set(this.videoActivo()?.id === video.id ? null : video);
  }

  publicUrl(path: string): string {
    return this.archivoService.publicUrl(path);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.archivoService.publicUrl(archivo.url_storage), '_blank');
  }

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() {
    this.fotoAmpliada.set(null);
  }

  editarOferta() {
    const expedienteId = this.detalle()?.expediente_id;
    if (expedienteId) this.router.navigate(['/builder/make-offer', expedienteId]);
  }

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
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
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    const w = this.translate.instant('offer.weeks');
    if (min === max)  return `${min} ${w}`;
    return `${min ?? '?'} – ${max ?? '?'} ${w}`;
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  volver() {
    this.router.navigate(['/builder/my-offers']);
  }
}
