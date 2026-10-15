import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ArchivoRow, OfertaDetalle, nombreServicio, serviciosDeOferta } from '../../models';
import { ServicioCompleto } from '../../data/servicio.repository';

const ESTADO_ICON: Record<string, string> = {
  pendiente: 'bi-hourglass',
  aceptada:  'bi-check-circle',
  rechazada: 'bi-x-circle',
};

@Component({
  selector: 'app-my-offer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './my-offer.component.html',
  styleUrl: './my-offer.component.css',
})
export class MyOfferComponent implements OnInit {
  private ofertaService     = inject(OfertaService);
  private expedienteService = inject(ExpedienteService);
  private archivoService    = inject(ArchivoService);
  private sanitizer      = inject(DomSanitizer);
  private translate      = inject(TranslateService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);

  detalle    = signal<OfertaDetalle | null>(null);
  /** Servicios a los que se presentó la oferta, en el orden del expediente. */
  serviciosOferta = signal<ServicioCompleto[]>([]);
  documentos = signal<ArchivoRow[]>([]);
  videos     = signal<ArchivoRow[]>([]);
  cargando   = signal(true);
  errorMsg   = signal('');

  fotosExp      = signal<ArchivoRow[]>([]);
  documentosExp = signal<ArchivoRow[]>([]);
  tabMedia      = signal<'tour' | 'fotos' | 'docs'>('tour');

  fotoAmpliada = signal<string | null>(null);
  videoActivo  = signal<ArchivoRow | null>(null);

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

      const [archivosExp, serviciosExp] = await Promise.all([
        this.archivoService.listarPorExpediente(detalle.expediente_id),
        // Sin la lista se enseña el servicio principal, como antes.
        this.expedienteService.getServiciosCompletos(detalle.expediente_id).catch(e => {
          console.error('[MyOffer] servicios:', e?.message ?? e);
          return [] as ServicioCompleto[];
        }),
      ]);
      this.fotosExp.set(archivosExp.fotos);
      this.documentosExp.set(archivosExp.documentos);
      this.serviciosOferta.set(serviciosDeOferta(serviciosExp, detalle));
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

  /** Nombres de los servicios de la oferta; vacío si no se pudieron leer. */
  serviciosNombres(): string[] {
    const lang = this.translate.currentLang;
    return this.serviciosOferta().map(s => nombreServicio(s, lang));
  }

  serviciosTexto(): string {
    const nombres = this.serviciosNombres();
    return nombres.length ? nombres.join(' · ') : this.servicioNombre();
  }

  estadoIcon(estado: string): string {
    return ESTADO_ICON[estado] ?? 'bi-circle';
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
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(valor);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    const w = this.translate.instant('offer.weeks');
    if (min === max) return `${min} ${w}`;
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
