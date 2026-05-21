import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteParaOferta, ArchivoRow, OfertaForm } from '../../models';

@Component({
  selector: 'app-make-offer',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './make-offer.component.html',
  styleUrl: './make-offer.component.css',
})
export class MakeOfferComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private archivoService    = inject(ArchivoService);
  private ofertaService     = inject(OfertaService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  user     = toSignal(this.auth.user$);
  detalle  = signal<ExpedienteParaOferta | null>(null);
  cargando = signal(true);
  errorMsg = signal('');

  // Archivos del expediente (solo lectura)
  fotos      = signal<ArchivoRow[]>([]);
  documentos = signal<ArchivoRow[]>([]);

  // Formulario de oferta
  precio: number | null          = null;
  plazoMin: number | null        = null;
  plazoMax: number | null        = null;
  garantiaAnos: number | null    = null;
  fechaInicio                    = '';
  descripcion                    = '';

  // Archivos de la oferta
  documentoOferta = signal<File | null>(null);
  videoOferta     = signal<File | null>(null);

  // Archivos ya guardados (modo edición)
  documentoActual = signal<ArchivoRow | null>(null);
  videoActual     = signal<ArchivoRow | null>(null);

  ofertaId = signal<string | null>(null);
  enviada  = signal(false);

  enviando   = signal(false);
  exitoMsg   = signal('');
  errorEnvio = signal('');

  fotoAmpliada = signal<string | null>(null);
  tabMedia     = signal<'fotos' | 'tour' | 'docs'>('tour');

  private expedienteId = '';

  get completedSteps(): number {
    let n = 0;
    if (this.precio && this.precio > 0) n++;
    if (this.plazoMin && this.plazoMin > 0 && this.plazoMax && this.plazoMax >= (this.plazoMin ?? 0)) n++;
    if (this.fechaInicio) n++;
    if (this.descripcion.trim()) n++;
    if (this.documentoActual() || this.documentoOferta()) n++;
    return n;
  }

  get formularioCompleto(): boolean {
    const esNueva = !this.ofertaId();
    return !!(
      this.precio && this.precio > 0 &&
      this.plazoMin && this.plazoMin > 0 &&
      this.plazoMax && this.plazoMax >= (this.plazoMin ?? 0) &&
      this.fechaInicio &&
      this.descripcion.trim() &&
      (!esNueva || this.documentoOferta())
    );
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    const userId = this.user()?.id;

    try {
      const [detalle, archivosExpediente, ofertaExistente] = await Promise.all([
        this.expedienteService.getExpedienteParaOferta(id),
        this.archivoService.listarPorExpediente(id),
        userId ? this.ofertaService.getOfertaPorExpediente(id, userId) : Promise.resolve(null),
      ]);
      this.detalle.set(detalle);
      this.fotos.set(archivosExpediente.fotos);
      this.documentos.set(archivosExpediente.documentos);

      if (ofertaExistente) {
        this.ofertaId.set(ofertaExistente.id);
        this.precio       = ofertaExistente.precio;
        this.plazoMin     = ofertaExistente.plazo_semanas_min;
        this.plazoMax     = ofertaExistente.plazo_semanas_max;
        this.garantiaAnos = ofertaExistente.garantia_anos;
        this.fechaInicio  = ofertaExistente.fecha_inicio;
        this.descripcion  = ofertaExistente.descripcion;

        const ofertaArchivos = await this.archivoService.cargarPorOferta(ofertaExistente.id);
        this.documentoActual.set(ofertaArchivos.documentos[0] ?? null);
        this.videoActual.set(ofertaArchivos.videos[0] ?? null);
      }
    } catch (e: any) {
      console.error('[MakeOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  onDocumento(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.documentoOferta.set(file);
  }

  onVideo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.videoOferta.set(file);
  }

  async enviarOferta() {
    this.errorEnvio.set('');
    this.exitoMsg.set('');

    if (!this.precio || this.precio <= 0) {
      this.errorEnvio.set('make_offer.err_price');
      return;
    }
    if (!this.plazoMin || this.plazoMin <= 0) {
      this.errorEnvio.set('make_offer.err_plazo_min');
      return;
    }
    if (!this.plazoMax || this.plazoMax < this.plazoMin) {
      this.errorEnvio.set('make_offer.err_plazo_max');
      return;
    }
    if (!this.fechaInicio) {
      this.errorEnvio.set('make_offer.err_date');
      return;
    }
    if (!this.descripcion.trim()) {
      this.errorEnvio.set('make_offer.err_desc');
      return;
    }

    const esNueva = !this.ofertaId();
    if (esNueva && !this.documentoOferta()) {
      this.errorEnvio.set('make_offer.err_doc');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorEnvio.set('make_offer.err_session'); return; }

    const form: OfertaForm = {
      precio:            this.precio,
      plazo_semanas_min: this.plazoMin,
      plazo_semanas_max: this.plazoMax,
      garantia_anos:     this.garantiaAnos,
      fecha_inicio:      this.fechaInicio,
      descripcion:       this.descripcion.trim(),
    };

    this.enviando.set(true);
    try {
      if (esNueva) {
        await this.ofertaService.enviar(
          this.expedienteId,
          userId,
          form,
          this.documentoOferta(),
          this.videoOferta(),
        );
        this.enviada.set(true);
        this.exitoMsg.set('make_offer.success_sent');
      } else {
        await this.ofertaService.actualizar(
          this.ofertaId()!,
          userId,
          form,
          this.documentoOferta(),
          this.videoOferta(),
        );
        if (this.documentoOferta() || this.videoOferta()) {
          const ofertaArchivos = await this.archivoService.cargarPorOferta(this.ofertaId()!);
          this.documentoActual.set(ofertaArchivos.documentos[0] ?? null);
          this.videoActual.set(ofertaArchivos.videos[0] ?? null);
          this.documentoOferta.set(null);
          this.videoOferta.set(null);
        }
        this.exitoMsg.set('make_offer.success_updated');
      }
    } catch (e: any) {
      console.error('[MakeOffer] guardar:', e.message);
      this.errorEnvio.set(e.message);
    } finally {
      this.enviando.set(false);
    }
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
  }

  servicioDescripcion(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_descripcion_en || d.servicio_descripcion;
    if (lang === 'fr') return d.servicio_descripcion_fr || d.servicio_descripcion;
    return d.servicio_descripcion;
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

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() {
    this.fotoAmpliada.set(null);
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
    const time = valor.split('T')[1]?.slice(0, 5);
    return time ?? '—';
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  verMisOfertas() {
    this.router.navigate(['/builder/my-offers']);
  }

  volver() {
    this.router.navigate(['/builder/available-files']);
  }
}
