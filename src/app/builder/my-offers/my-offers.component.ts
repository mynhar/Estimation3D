import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { OfertaService } from '../../services/oferta.service';
import { OfertaRow, ESTADO_BADGE_OFERTA, ESTADO_LABEL_OFERTA } from '../../models';

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#d97706',
  aceptada:  '#16a34a',
  rechazada: '#dc3545',
};

const ESTADO_ICON: Record<string, string> = {
  pendiente: 'bi-hourglass-split',
  aceptada:  'bi-trophy-fill',
  rechazada: 'bi-x-circle-fill',
};

@Component({
  selector: 'app-my-offers',
  standalone: true,
  imports: [RouterLink, FormsModule],
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

  // ── Filtros ───────────────────────────────────────────────────────────────
  busqueda     = signal('');
  filtroEstado = signal<'todos'|'pendiente'|'aceptada'|'rechazada'>('todos');

  hayFiltros = computed(() =>
    this.busqueda()     !== ''     ||
    this.filtroEstado() !== 'todos'
  );

  ofertasFiltradas = computed(() => {
    const q  = this.busqueda().toLowerCase().trim();
    const fe = this.filtroEstado();
    return this.ofertas().filter(o => {
      if (fe !== 'todos' && o.estado !== fe) return false;
      if (q && !(
        o.expediente_numero.toLowerCase().includes(q) ||
        o.servicio_nombre.toLowerCase().includes(q)   ||
        o.provincia.toLowerCase().includes(q)         ||
        o.canton.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  });

  totalPendientes = computed(() => this.ofertas().filter(o => o.estado === 'pendiente').length);
  totalAceptadas  = computed(() => this.ofertas().filter(o => o.estado === 'aceptada').length);
  totalRechazadas = computed(() => this.ofertas().filter(o => o.estado === 'rechazada').length);

  montoAdjudicado = computed(() =>
    this.ofertas()
      .filter(o => o.estado === 'aceptada')
      .reduce((s, o) => s + o.precio, 0)
  );

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  badgeClass(estado: string): string  { return ESTADO_BADGE_OFERTA[estado]  ?? 'bg-light text-dark'; }
  estadoLabel(estado: string): string { return ESTADO_LABEL_OFERTA[estado]  ?? estado; }
  estadoColor(estado: string): string { return ESTADO_COLOR[estado]          ?? '#adb5bd'; }
  estadoIcon(estado: string):  string { return ESTADO_ICON[estado]           ?? 'bi-circle'; }

  formatCosto(valor: number): string {
    return `₡ ${valor.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set('todos');
  }

  ver(id: string) { this.router.navigate(['/builder/my-offer', id]); }
}
