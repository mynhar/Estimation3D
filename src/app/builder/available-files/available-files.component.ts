import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteDisponible } from '../../models';

@Component({
  selector: 'app-available-files',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
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

  hayFiltros = computed(() =>
    this.busqueda()          !== ''     ||
    this.filtroCompetencia() !== 'todos'||
    this.filtroOferta()      !== 'todos'
  );

  expedientesFiltrados = computed(() => {
    const q  = this.busqueda().toLowerCase().trim();
    const fc = this.filtroCompetencia();
    const fo = this.filtroOferta();

    return this.expedientes().filter(exp => {
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
    });
  });

  totalSinOferta = computed(() =>
    this.expedientes().filter(e => !this.tieneOferta(e.id)).length
  );
  totalConOferta = computed(() =>
    this.expedientes().filter(e =>  this.tieneOferta(e.id)).length
  );

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

  competenciaLabel(n: number): string {
    if (n <= 1) return 'competition.low';
    if (n <= 3) return 'competition.mid';
    return 'competition.high';
  }

  competenciaColor(n: number): string {
    if (n <= 1) return '#16a34a';
    if (n <= 3) return '#d97706';
    return '#dc3545';
  }

  competenciaBadge(n: number): string {
    if (n <= 1) return 'text-bg-success';
    if (n <= 3) return 'text-bg-warning';
    return 'text-bg-danger';
  }

  servicioNombre(exp: ExpedienteDisponible): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
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
