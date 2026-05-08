import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import { ArchivoRow, OfertaDetalle, ESTADO_BADGE_OFERTA, ESTADO_LABEL_OFERTA } from '../../models';

@Component({
  selector: 'app-my-offer',
  standalone: true,
  imports: [],
  templateUrl: './my-offer.component.html',
  styleUrl: './my-offer.component.css',
})
export class MyOfferComponent implements OnInit {
  private ofertaService  = inject(OfertaService);
  private archivoService = inject(ArchivoService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);

  detalle    = signal<OfertaDetalle | null>(null);
  documentos = signal<ArchivoRow[]>([]);
  videos     = signal<ArchivoRow[]>([]);
  cargando   = signal(true);
  errorMsg   = signal('');

  videoActivo = signal<ArchivoRow | null>(null);

  private ofertaId = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.ofertaId = id;

    try {
      const [detalle, archivos] = await Promise.all([
        this.ofertaService.getOferta(id),
        this.archivoService.cargarPorOferta(id),
      ]);
      this.detalle.set(detalle);
      this.documentos.set(archivos.documentos);
      this.videos.set(archivos.videos);
    } catch (e: any) {
      console.error('[MyOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  badgeClass(estado: string): string {
    return ESTADO_BADGE_OFERTA[estado] ?? 'bg-light text-dark';
  }

  estadoLabel(estado: string): string {
    return ESTADO_LABEL_OFERTA[estado] ?? estado;
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

  editarOferta() {
    const expedienteId = this.detalle()?.expediente_id;
    if (expedienteId) this.router.navigate(['/builder/make-offer', expedienteId]);
  }

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    return new Date(`${raw}T00:00:00`).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    if (min === max)  return `${min} semana(s)`;
    return `${min ?? '?'} – ${max ?? '?'} semanas`;
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
