import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { OfertaService } from '../../services/oferta.service';
import { OfertaRow, ESTADO_BADGE_OFERTA, ESTADO_LABEL_OFERTA } from '../../models';

@Component({
  selector: 'app-my-offers',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './my-offers.component.html',
  styleUrl: './my-offers.component.css',
})
export class MyOffersComponent implements OnInit {
  private auth          = inject(AuthSupabaseService);
  private ofertaService = inject(OfertaService);
  private router        = inject(Router);

  user     = toSignal(this.auth.user$);
  ofertas  = signal<OfertaRow[]>([]);
  cargando = signal(true);

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.ofertas.set(await this.ofertaService.getMisOfertas(userId));
    } catch (e: any) {
      console.error('[MyOffers]', e.message);
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

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor + 'T00:00:00').toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    if (min === max)  return `${min} sem.`;
    return `${min ?? '?'} – ${max ?? '?'} sem.`;
  }

  ver(id: string) {
    this.router.navigate(['/builder/my-offer', id]);
  }
}
