import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import {
  ExpedienteRow,
  ESTADOS_ESTIMADO,
  ESTADO_BADGE_ESTIMADOR,
} from '../../models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-estimated-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, PaginationComponent],
  templateUrl: './estimated-files.component.html',
  styleUrl:    './estimated-files.component.css',
})
export class EstimatedFilesComponent implements OnInit {
  private auth               = inject(AuthSupabaseService);
  private expedienteService  = inject(ExpedienteService);
  private estimacionService  = inject(EstimacionService);
  private translate          = inject(TranslateService);
  private router             = inject(Router);

  user         = toSignal(this.auth.user$);
  expedientes  = signal<ExpedienteRow[]>([]);
  cargando     = signal(true);
  busqueda     = signal('');
  filtroEstado = signal<string | null>(null);

  confirmandoId  = signal<string | null>(null);
  eliminando     = signal(false);
  errorEliminar  = signal('');
  vista          = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  readonly estadoChips: { value: string }[] = [
    { value: 'estimado'   },
    { value: 'en_oferta'  },
    { value: 'adjudicado' },
    { value: 'contratado' },
    { value: 'cancelado'  },
  ];

  expedientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const e = this.filtroEstado();
    return this.expedientes().filter(exp => {
      if (e && exp.estado !== e) return false;
      if (!q) return true;
      return (
        exp.numero.toLowerCase().includes(q)             ||
        exp.servicio_nombre.toLowerCase().includes(q)    ||
        exp.servicio_nombre_en.toLowerCase().includes(q) ||
        exp.servicio_nombre_fr.toLowerCase().includes(q) ||
        exp.cliente_nombre.toLowerCase().includes(q)     ||
        exp.provincia.toLowerCase().includes(q)          ||
        exp.canton.toLowerCase().includes(q)
      );
    });
  });

  // ── Paginación ─────────────────────────────────────────────────────────────
  readonly POR_PAGINA = 9;
  paginaActual = signal(1);

  expedientesPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.expedientesFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() => this.busqueda() !== '' || this.filtroEstado() !== null);

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroEstado();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  contarEstado(estado: string): number {
    return this.expedientes().filter(e => e.estado === estado).length;
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.expedientes.set(await this.expedienteService.getExpedienteRows({
        estados:     ESTADOS_ESTIMADO,
        estimadorId: userId,
      }));
    } catch (e: any) {
      console.error('[EstimatedFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  badgeClass(estado: string | undefined): string {
    return ESTADO_BADGE_ESTIMADOR[estado ?? ''] ?? 'bg-light text-dark';
  }

  estadoLabel(estado: string | undefined): string {
    return 'state.' + (estado ?? '');
  }

  servicioNombre(exp: ExpedienteRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set(null);
  }

  setVista(v: VistaExpedientes) {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del tour 3D Matterport.
   * Null si el expediente no tiene tour o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteRow): string | null {
    return this.fotosFallidas().has(exp.id) ? null : exp.foto;
  }

  onFotoError(id: string) {
    this.fotosFallidas.update(set => new Set(set).add(id));
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
    if (!valor) return '—';
    if (valor.includes('T')) {
      const time = valor.split('T')[1]?.slice(0, 5);
      return time ?? '—';
    }
    return '—';
  }

  ver(id: string) {
    this.router.navigate(['/estimator/estimated-file', id]);
  }

  pedirConfirmacion(id: string) {
    const exp = this.expedientes().find(e => e.id === id);
    if (exp?.estado === 'adjudicado' || exp?.estado === 'contratado') return;
    this.errorEliminar.set('');
    this.confirmandoId.set(id);
  }

  cancelarConfirmacion() {
    this.confirmandoId.set(null);
    this.errorEliminar.set('');
  }

  async eliminarEstimacion(exp: ExpedienteRow) {
    this.errorEliminar.set('');
    this.eliminando.set(true);
    try {
      await this.estimacionService.eliminar(exp.id);
      await this.expedienteService.actualizarEstado(exp.id, 'nuevo');
      this.expedientes.update(list => list.filter(e => e.id !== exp.id));
      this.confirmandoId.set(null);
    } catch (e: any) {
      console.error('[EstimatedFiles] eliminar:', e.message);
      this.errorEliminar.set(e.message);
    } finally {
      this.eliminando.set(false);
    }
  }
}
