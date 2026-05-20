import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteConOfertas, ESTADO_BADGE_OFERTA_RECIBIDA } from '../../models';

@Component({
  selector: 'app-offers-received',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './offers-received.component.html',
  styleUrl: './offers-received.component.css',
})
export class OffersReceivedComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteConOfertas[]>([]);
  cargando    = signal(true);

  pendientes  = computed(() => this.expedientes().filter(e => e.estado === 'en_oferta'));
  gestionados = computed(() => this.expedientes().filter(e => e.estado !== 'en_oferta'));

  private readonly ESTADO_COLOR: Record<string, string> = {
    en_oferta:  '#d97706',
    adjudicado: '#ea580c',
    contratado: '#16a34a',
    cancelado:  '#94a3b8',
  };

  estadoColor(estado: string): string {
    return this.ESTADO_COLOR[estado] ?? '#94a3b8';
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
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
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
