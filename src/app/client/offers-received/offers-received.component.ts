import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteConOfertas, ESTADO_BADGE_OFERTA_RECIBIDA } from '../../models';

@Component({
  selector: 'app-offers-received',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
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

  pendientes  = computed(() => this.expedientes().filter(e => e.estado === 'en_oferta'));
  gestionados = computed(() => this.expedientes().filter(e => e.estado !== 'en_oferta'));

  servicioNombre(exp: ExpedienteConOfertas): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  servicioDescripcion(exp: ExpedienteConOfertas): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_descripcion_en || exp.servicio_descripcion;
    if (lang === 'fr') return exp.servicio_descripcion_fr || exp.servicio_descripcion;
    return exp.servicio_descripcion;
  }

  ofertasLabel(n: number): string {
    return n === 1 ? '1 oferta' : `${n} ofertas`;
  }

  ofertasTip(n: number): string {
    if (n >= 5) return `${n} ofertas · Cupo lleno`;
    if (n >= 3) return `${n} ofertas disponibles`;
    return `${n} oferta${n !== 1 ? 's' : ''} disponible${n !== 1 ? 's' : ''}`;
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }

    try {
      this.expedientes.set(await this.expedienteService.getExpedientesConOfertas(userId));
    } catch (e: any) {
      console.error('[OffersReceived]', e.message);
    } finally {
      this.cargando.set(false);
    }
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
    if (!valor || !valor.includes('T')) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  estadoTexto(estado: string): string {
    return ESTADO_BADGE_OFERTA_RECIBIDA[estado]?.texto ?? estado;
  }

  estadoClase(estado: string): string {
    return ESTADO_BADGE_OFERTA_RECIBIDA[estado]?.clase ?? 'bg-secondary';
  }

  ver(id: string) {
    this.router.navigate(['/client/builder-offer', id]);
  }
}
