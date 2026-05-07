import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteConOfertas, ESTADO_BADGE_OFERTA_RECIBIDA } from '../../models';

@Component({
  selector: 'app-offers-received',
  standalone: true,
  imports: [],
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
