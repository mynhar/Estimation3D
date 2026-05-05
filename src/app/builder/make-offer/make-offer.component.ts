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

  enviando    = signal(false);
  exitoMsg    = signal('');
  errorEnvio  = signal('');

  private expedienteId = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [detalle, archivos] = await Promise.all([
        this.expedienteService.getExpedienteParaOferta(id),
        this.archivoService.cargarTodos(id),
      ]);
      this.detalle.set(detalle);
      this.fotos.set(archivos.fotos);
      this.videos.set(archivos.videos);
      this.documentos.set(archivos.documentos);
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
    if (!this.documentoOferta()) {
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
      await this.ofertaService.enviar(
        this.expedienteId,
        userId,
        form,
        this.documentoOferta(),
        this.videoOferta(),
      );
      this.exitoMsg.set('Oferta enviada correctamente.');
    } catch (e: any) {
      console.error('[MakeOffer] enviar:', e.message);
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

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
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

  volver() {
    this.router.navigate(['/builder/available-files']);
  }
}
