import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteDisponible } from '../../models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

@Component({
  selector: 'app-available-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, PaginationComponent],
  templateUrl: './available-files.component.html',
  styleUrl: './available-files.component.css',
})
export class AvailableFilesComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private ofertaService     = inject(OfertaService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  user          = toSignal(this.auth.user$);
  expedientes   = signal<ExpedienteDisponible[]>([]);
  ofertasHechas = signal<Set<string>>(new Set());
  cargando      = signal(true);

  // ── Filtros ───────────────────────────────────────────────────────────────
  busqueda          = signal('');
  filtroCompetencia = signal<'todos'|'baja'|'media'|'alta'>('todos');
  filtroOferta      = signal<'todos'|'sin'|'con'>('todos');

  // ── Paginación ─────────────────────────────────────────────────────────────
  readonly POR_PAGINA = 9;
  paginaActual = signal(1);

  hayFiltros = computed(() =>
    this.busqueda()          !== ''     ||
    this.filtroCompetencia() !== 'todos'||
    this.filtroOferta()      !== 'todos'
  );

  // Filtra y ordena por creado_en descendente (más recientes primero)
  expedientesFiltrados = computed(() => {
    const q  = this.busqueda().toLowerCase().trim();
    const fc = this.filtroCompetencia();
    const fo = this.filtroOferta();

    return this.expedientes()
      .filter(exp => {
        if (q && !(
          exp.numero.toLowerCase().includes(q)             ||
          exp.servicio_nombre.toLowerCase().includes(q)    ||
          exp.servicio_nombre_en.toLowerCase().includes(q) ||
          exp.servicio_nombre_fr.toLowerCase().includes(q) ||
          exp.provincia.toLowerCase().includes(q)          ||
          exp.canton.toLowerCase().includes(q)             ||
          exp.direccion.toLowerCase().includes(q)
        )) return false;

        const n = exp.total_ofertas;
        if (fc === 'baja'  && n  >  1)          return false;
        if (fc === 'media' && (n < 2 || n > 3)) return false;
        if (fc === 'alta'  && n  <  4)          return false;

        if (fo === 'sin' &&  this.tieneOferta(exp.id)) return false;
        if (fo === 'con' && !this.tieneOferta(exp.id)) return false;

        return true;
      })
      .sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());
  });

  expedientesPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.expedientesFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  totalSinOferta = computed(() =>
    this.expedientes().filter(e => !this.tieneOferta(e.id)).length
  );
  totalConOferta = computed(() =>
    this.expedientes().filter(e =>  this.tieneOferta(e.id)).length
  );

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroCompetencia();
      this.filtroOferta();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    try {
      const [expedientes, ofertasHechas] = await Promise.all([
        this.expedienteService.getExpedientesDisponibles(),
        userId
          ? this.ofertaService.getExpedienteIdsConOferta(userId)
          : Promise.resolve(new Set<string>()),
      ]);
      this.expedientes.set(expedientes);
      this.ofertasHechas.set(ofertasHechas);
    } catch (e: any) {
      console.error('[AvailableFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  tieneOferta(expedienteId: string): boolean {
    return this.ofertasHechas().has(expedienteId);
  }

  // Devuelve true si el expediente fue creado en los últimos 7 días
  esReciente(creado_en: string): boolean {
    if (!creado_en) return false;
    const d = new Date(creado_en);
    return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }

  competenciaLabel(n: number): string {
    if (n <= 1) return 'competition.low';
    if (n <= 3) return 'competition.mid';
    return 'competition.high';
  }

  // Devuelve hex que coincide exactamente con los tokens DS semánticos
  competenciaColor(n: number): string {
    if (n <= 1) return '#5B7A4F'; // --ds-success
    if (n <= 3) return '#B8862E'; // --ds-warning
    return '#A14545';              // --ds-danger
  }

  competenciaClass(n: number): string {
    if (n <= 1) return 'cbadge--low';
    if (n <= 3) return 'cbadge--mid';
    return 'cbadge--high';
  }

  servicioNombre(exp: ExpedienteDisponible): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  formatFechaCorta(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  formatPrecio(v: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroCompetencia.set('todos');
    this.filtroOferta.set('todos');
  }

  hacerOferta(id: string) {
    this.router.navigate(['/builder/make-offer', id]);
  }

  readonly slots = [1, 2, 3, 4, 5];
}
