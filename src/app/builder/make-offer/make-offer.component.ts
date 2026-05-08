import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteParaOferta, ArchivoRow, OfertaForm } from '../../models';

@Component({
  selector: 'app-make-offer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './make-offer.component.html',
  styleUrl: './make-offer.component.css',
})
export class MakeOfferComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
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
  videos     = signal<ArchivoRow[]>([]);
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

  videoActivo  = signal<ArchivoRow | null>(null);
  fotoAmpliada = signal<string | null>(null);

  private expedienteId = '';

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
        this.archivoService.cargarTodos(id),
        userId ? this.ofertaService.getOfertaPorExpediente(id, userId) : Promise.resolve(null),
      ]);
      this.detalle.set(detalle);
      this.fotos.set(archivosExpediente.fotos);
      this.videos.set(archivosExpediente.videos);
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
      this.errorEnvio.set('El precio total es obligatorio y debe ser mayor a 0.');
      return;
    }
    if (!this.plazoMin || this.plazoMin <= 0) {
      this.errorEnvio.set('El plazo mínimo es obligatorio.');
      return;
    }
    if (!this.plazoMax || this.plazoMax < this.plazoMin) {
      this.errorEnvio.set('El plazo máximo debe ser mayor o igual al mínimo.');
      return;
    }
    if (!this.fechaInicio) {
      this.errorEnvio.set('La fecha de inicio es obligatoria.');
      return;
    }
    if (!this.descripcion.trim()) {
      this.errorEnvio.set('La descripción de su enfoque es obligatoria.');
      return;
    }

    const esNueva = !this.ofertaId();
    if (esNueva && !this.documentoOferta()) {
      this.errorEnvio.set('El documento de oferta (PDF) es obligatorio.');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) { this.errorEnvio.set('No hay sesión activa.'); return; }

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
        this.exitoMsg.set('Oferta enviada correctamente.');
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
        this.exitoMsg.set('Oferta actualizada correctamente.');
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

  toggleVideo(video: ArchivoRow) {
    this.videoActivo.set(this.videoActivo()?.id === video.id ? null : video);
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
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    const time = valor.split('T')[1]?.slice(0, 5);
    return time ?? '—';
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
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
