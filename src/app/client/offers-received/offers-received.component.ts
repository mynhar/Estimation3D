import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import {
  ExpedienteConOfertas,
  OfertaResumen,
  ESTADO_BADGE_OFERTA_RECIBIDA,
} from '../../models';

type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-offers-received',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NgTemplateOutlet],
  templateUrl: './offers-received.component.html',
  styleUrl: './offers-received.component.css',
})
export class OffersReceivedComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteConOfertas[]>([]);
  cargando    = signal(true);
  vista       = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  pendientes  = computed(() => this.expedientes().filter(e => e.estado === 'en_oferta'));
  gestionados = computed(() => this.expedientes().filter(e => e.estado !== 'en_oferta'));

  servicioNombre(exp: ExpedienteConOfertas): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }
    try {
      this.expedientes.set(await this.expedienteService.getExpedientesConOfertas(userId));
    } catch (e: unknown) {
      console.error('[OffersReceived]', e instanceof Error ? e.message : e);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Resumen de ofertas ──────────────────────────────────────────────────────
  hayOfertas(exp: ExpedienteConOfertas): boolean { return exp.ofertas.length > 0; }

  precioMin(exp: ExpedienteConOfertas): number {
    return exp.ofertas.length ? Math.min(...exp.ofertas.map(o => o.precio)) : 0;
  }
  precioMax(exp: ExpedienteConOfertas): number {
    return exp.ofertas.length ? Math.max(...exp.ofertas.map(o => o.precio)) : 0;
  }

  ofertaAceptada(exp: ExpedienteConOfertas): OfertaResumen | null {
    return exp.ofertas.find(o => o.estado === 'aceptada') ?? null;
  }

  // ── Estado del expediente (badge) ───────────────────────────────────────────
  estadoTexto(estado: string): string {
    return ESTADO_BADGE_OFERTA_RECIBIDA[estado]?.texto ?? estado;
  }
  estadoClase(estado: string): string {
    return ESTADO_BADGE_OFERTA_RECIBIDA[estado]?.clase ?? 'bg-secondary';
  }

  // ── Formato ─────────────────────────────────────────────────────────────────
  formatPrecio(precio: number): string {
    const locale = this.translate.currentLang === 'fr' ? 'fr-CA'
                 : this.translate.currentLang === 'en' ? 'en-CA'
                 : 'es-CR';
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(precio);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  ver(id: string) {
    this.router.navigate(['/client/builder-offer', id]);
  }

  setVista(v: VistaExpedientes): void {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del primer tour 3D Matterport adjunto.
   * Devuelve null si no hay tour Matterport o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteConOfertas): string | null {
    if (this.fotosFallidas().has(exp.id)) return null;
    const modelId = this.matterportModelId(exp.url_tour);
    return modelId
      ? `https://my.matterport.com/api/v1/player/models/${modelId}/thumb?width=640&dpr=1`
      : null;
  }

  onFotoError(id: string): void {
    this.fotosFallidas.update(set => {
      const next = new Set(set);
      next.add(id);
      return next;
    });
  }

  /** Extrae el id del modelo Matterport (`?m=<id>`) del primer URL de tour. */
  private matterportModelId(urlTour: string | null): string | null {
    const [primera] = EstimacionService.parseUrls(urlTour);
    if (!primera || !/matterport\.com/i.test(primera)) return null;
    const match = primera.match(/[?&]m=([^&]+)/);
    return match ? match[1] : null;
  }
}
