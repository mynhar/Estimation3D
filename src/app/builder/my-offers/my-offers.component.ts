import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  imports: [RouterLink, FormsModule, TranslatePipe],
  templateUrl: './my-offers.component.html',
  styleUrl: './my-offers.component.css',
})
export class MyOffersComponent implements OnInit {
  private auth          = inject(AuthSupabaseService);
  private ofertaService = inject(OfertaService);
  private translate     = inject(TranslateService);
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
        o.expediente_numero.toLowerCase().includes(q)  ||
        o.servicio_nombre.toLowerCase().includes(q)    ||
        o.servicio_nombre_en.toLowerCase().includes(q) ||
        o.servicio_nombre_fr.toLowerCase().includes(q) ||
        o.provincia.toLowerCase().includes(q)          ||
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
  servicioNombre(o: OfertaRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return o.servicio_nombre_en || o.servicio_nombre;
    if (lang === 'fr') return o.servicio_nombre_fr || o.servicio_nombre;
    return o.servicio_nombre;
  }

  badgeClass(estado: string): string  { return ESTADO_BADGE_OFERTA[estado]  ?? 'bg-light text-dark'; }
  estadoLabel(estado: string): string { return ESTADO_LABEL_OFERTA[estado]  ?? estado; }
  estadoColor(estado: string): string { return ESTADO_COLOR[estado]          ?? '#adb5bd'; }
  estadoIcon(estado: string):  string { return ESTADO_ICON[estado]           ?? 'bi-circle'; }

  formatCosto(valor: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(valor);
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
