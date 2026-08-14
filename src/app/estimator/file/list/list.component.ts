import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { ExpedienteRow } from '../../../models';
import { coincideBusqueda, direccionLinea1, direccionLinea2, direccionCompleta } from '../../../shared/util/busqueda';

type Vista = 'tabla' | 'tarjetas';
type Grupo = 'todos' | 'creados' | 'en_estimacion' | 'estimados';

@Component({
  selector: 'app-estimator-file-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './list.component.html',
  styleUrl:    './list.component.css',
})
export class EstimatorFileListComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  private usuario = toSignal(this.auth.user$);

  expedientes = signal<ExpedienteRow[]>([]);
  cargando    = signal(true);
  error       = signal('');
  /** Id del estimador de la sesión: distingue «los que creé» de «los que me asignaron». */
  private userId = signal('');
  busqueda    = signal('');
  grupo       = signal<Grupo>('todos');
  vista       = signal<Vista>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  // ── Grupos ─────────────────────────────────────────────────────────────────
  // La lista trae los expedientes del estimador por sus tres vínculos (creados,
  // asignados, estimados) y los chips filtran dentro de ese conjunto. No son
  // grupos excluyentes: un expediente que creó y ya estimó cuenta en los dos.
  readonly GRUPOS: { key: Grupo; label: string; icon: string }[] = [
    { key: 'todos',         label: 'estimator_file_list.group_all',        icon: 'bi-collection'    },
    { key: 'creados',       label: 'estimator_file_list.group_created',    icon: 'bi-folder-plus'   },
    { key: 'en_estimacion', label: 'estimator_file_list.group_in_progress', icon: 'bi-pencil-square' },
    { key: 'estimados',     label: 'estimator_file_list.group_estimated',  icon: 'bi-check2-circle' },
  ];

  private readonly ESTADOS_ESTIMADOS = ['estimado', 'en_oferta', 'adjudicado', 'contratado'];

  /**
   * ¿El expediente entra en el chip? «Creados» mira la autoría (`creado_por`),
   * que la base sella en el alta y no deja cambiar; los otros dos miran el
   * estado. Los expedientes anteriores a la columna `creado_por` no tienen autor
   * y sólo aparecen en «todos» y en el grupo que les toque por estado.
   */
  private perteneceA(exp: ExpedienteRow, grupo: Grupo): boolean {
    switch (grupo) {
      case 'todos':         return true;
      case 'creados':       return !!exp.creado_por && exp.creado_por === this.userId();
      case 'en_estimacion': return exp.estado === 'en_estimacion';
      case 'estimados':     return this.ESTADOS_ESTIMADOS.includes(exp.estado ?? '');
    }
  }

  conteos = computed<Record<Grupo, number>>(() => {
    const base: Record<Grupo, number> = { todos: 0, creados: 0, en_estimacion: 0, estimados: 0 };
    for (const e of this.expedientes()) {
      for (const g of this.GRUPOS) if (this.perteneceA(e, g.key)) base[g.key]++;
    }
    return base;
  });

  expedientesFiltrados = computed(() => {
    const q = this.busqueda().trim();
    const g = this.grupo();
    return this.expedientes().filter(e => {
      if (!this.perteneceA(e, g)) return false;
      if (!q) return true;
      // Número, servicio (los tres idiomas), cliente y dirección completa.
      const haystack = [
        e.numero,
        e.servicio_nombre,
        e.servicio_nombre_en,
        e.servicio_nombre_fr,
        e.cliente_nombre,
        e.direccion,
        e.canton,
        e.provincia,
        e.distrito,
      ].join(' ');
      return coincideBusqueda(haystack, q);
    });
  });

  hayFiltros = computed(() => this.busqueda() !== '' || this.grupo() !== 'todos');

  // ── Dirección (formato postal en dos líneas) ───────────────────────────────
  direccionLinea1   = direccionLinea1;
  direccionLinea2   = direccionLinea2;
  direccionCompleta = direccionCompleta;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.usuario()?.id ?? (await this.auth.client.auth.getUser()).data.user?.id;
    if (!userId) {
      this.cargando.set(false);
      this.error.set('file_create.session_error');
      return;
    }
    this.userId.set(userId);
    try {
      this.expedientes.set(await this.expedienteService.getExpedientesDeEstimador(userId));
    } catch (e: any) {
      console.error('[EstimatorFileList]', e?.message ?? e);
      this.error.set('estimator_file_list.load_error');
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Presentación ───────────────────────────────────────────────────────────
  servicioNombre(exp: ExpedienteRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  estadoLabel(estado: string | undefined): string {
    return estado ? `state.${estado}` : 'common.none';
  }

  /** Modificador de color del distintivo de estado. */
  estadoTono(estado: string | undefined): string {
    switch (estado) {
      case 'nuevo':         return 'nuevo';
      case 'en_estimacion': return 'proceso';
      case 'cancelado':     return 'cancelado';
      default:              return 'listo';
    }
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  fotoExpediente(exp: ExpedienteRow): string | null {
    return this.fotosFallidas().has(exp.id) ? null : exp.foto;
  }

  onFotoError(id: string) {
    this.fotosFallidas.update(set => new Set(set).add(id));
  }

  // ── Interacción ────────────────────────────────────────────────────────────
  setVista(v: Vista)  { this.vista.set(v); }
  setGrupo(g: Grupo)  { this.grupo.set(g); }

  limpiarFiltros() {
    this.busqueda.set('');
    this.grupo.set('todos');
  }

  editar(id: string) {
    this.router.navigate(['/estimator/file/edit', id]);
  }
}
