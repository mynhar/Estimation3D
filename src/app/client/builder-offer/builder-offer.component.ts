import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import { ArchivoService } from '../../services/archivo.service';
import { OfertaService } from '../../services/oferta.service';
import {
  ArchivoRow,
  EstimacionDetalle,
  ExpedienteDetalleCliente,
  ESTADO_BADGE_OFERTA,
  ESTADO_LABEL_OFERTA,
  OfertaConConstructor,
} from '../../models';

@Component({
  selector: 'app-builder-offer',
  standalone: true,
  imports: [DecimalPipe, TitleCasePipe],
  templateUrl: './builder-offer.component.html',
  styleUrl: './builder-offer.component.css',
})
export class BuilderOfferComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private ofertaService     = inject(OfertaService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  user = toSignal(this.auth.user$);

  // ── Datos ──────────────────────────────────────────────────────────────────
  expediente    = signal<ExpedienteDetalleCliente | null>(null);
  estimacion    = signal<EstimacionDetalle | null>(null);
  ofertas       = signal<OfertaConConstructor[]>([]);
  fotosExp      = signal<ArchivoRow[]>([]);
  videosExp     = signal<ArchivoRow[]>([]);
  documentosExp = signal<ArchivoRow[]>([]);

  // ── Estado UI ─────────────────────────────────────────────────────────────
  cargando  = signal(true);
  errorMsg  = signal('');
  exitoMsg  = signal('');
  aceptando = signal(false);

  // ── Selección de oferta ───────────────────────────────────────────────────
  ofertaSeleccionadaId = signal<string | null>(null);

  // ── Lightbox de fotos ─────────────────────────────────────────────────────
  fotoAmpliada = signal<string | null>(null);

  // ── Video inline — sección estimador ─────────────────────────────────────
  videoExpUrl = signal<string | null>(null);

  // ── Video inline — sección oferta (almacena { ofertaId, url }) ───────────
  videoOfertaActiva = signal<{ ofertaId: string; url: string } | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  yaAdjudicado       = computed(() => this.expediente()?.estado === 'adjudicado');
  puedeAceptar       = computed(() => this.ofertaSeleccionadaId() !== null && !this.aceptando());
  ofertaSeleccionada = computed(() => {
    const id = this.ofertaSeleccionadaId();
    return id ? (this.ofertas().find(o => o.id === id) ?? null) : null;
  });

  private expedienteId = '';

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const [exp, estimacion, ofertas, archivos] = await Promise.all([
        this.expedienteService.getDetalleParaCliente(id),
        this.estimacionService.get(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
      ]);

      this.expediente.set(exp);
      this.estimacion.set(estimacion);
      this.ofertas.set(ofertas);
      this.fotosExp.set(archivos.fotos);
      this.videosExp.set(archivos.videos);
      this.documentosExp.set(archivos.documentos);

      // Pre-seleccionar la oferta aceptada si ya existe
      const aceptada = ofertas.find(o => o.estado === 'aceptada');
      if (aceptada) this.ofertaSeleccionadaId.set(aceptada.id);

    } catch (e: any) {
      console.error('[BuilderOffer]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Selección de oferta ───────────────────────────────────────────────────

  seleccionar(ofertaId: string) {
    this.ofertaSeleccionadaId.set(ofertaId);
    this.exitoMsg.set('');
    this.errorMsg.set('');
  }

  esSeleccionada(ofertaId: string): boolean {
    return this.ofertaSeleccionadaId() === ofertaId;
  }

  async aceptarOferta() {
    const ofertaId = this.ofertaSeleccionadaId();
    if (!ofertaId) return;

    this.aceptando.set(true);
    this.errorMsg.set('');
    this.exitoMsg.set('');

    try {
      await this.ofertaService.aceptarOferta(this.expedienteId, ofertaId);

      // Actualizar estado local sin recargar
      this.expediente.update(e => e ? { ...e, estado: 'adjudicado' } : e);
      this.ofertas.update(list =>
        list.map(o => ({ ...o, estado: o.id === ofertaId ? 'aceptada' : 'rechazada' }))
      );

      this.exitoMsg.set('Oferta aceptada. El expediente ha sido adjudicado.');
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.aceptando.set(false);
    }
  }

  // ── Lightbox de fotos ─────────────────────────────────────────────────────

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() {
    this.fotoAmpliada.set(null);
  }

  // ── Video inline — estimador ──────────────────────────────────────────────

  toggleVideoExp(archivo: ArchivoRow) {
    const url = this.publicUrl(archivo.url_storage);
    this.videoExpUrl.set(this.videoExpUrl() === url ? null : url);
  }

  // ── Video inline — oferta ─────────────────────────────────────────────────

  toggleVideoOferta(ofertaId: string, archivo: ArchivoRow) {
    const url    = this.publicUrl(archivo.url_storage);
    const actual = this.videoOfertaActiva();
    if (actual?.ofertaId === ofertaId && actual?.url === url) {
      this.videoOfertaActiva.set(null);
    } else {
      this.videoOfertaActiva.set({ ofertaId, url });
    }
  }

  videoOfertaUrl(ofertaId: string): string | null {
    const a = this.videoOfertaActiva();
    return a?.ofertaId === ofertaId ? a.url : null;
  }

  // ── Archivos generales ────────────────────────────────────────────────────

  publicUrl(path: string): string {
    return this.archivoService.publicUrl(path);
  }

  verDocumento(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }

  // ── Formatters ────────────────────────────────────────────────────────────

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    // Agregar T00:00:00 evita el desplazamiento de zona horaria en fechas sin hora
    const d = new Date(valor.includes('T') ? valor : valor + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
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

  ofertaBadgeClass(estado: string): string {
    return ESTADO_BADGE_OFERTA[estado] ?? 'bg-secondary';
  }

  ofertaLabel(estado: string): string {
    return ESTADO_LABEL_OFERTA[estado] ?? estado;
  }

  expedienteBadgeClass(estado: string): string {
    const map: Record<string, string> = {
      'en_oferta':  'bg-primary',
      'adjudicado': 'bg-warning text-dark',
      'contratado': 'bg-success',
      'cancelado':  'bg-secondary',
    };
    return map[estado] ?? 'bg-primary';
  }

  volver() {
    this.router.navigate(['/client/offers-received']);
  }
}
