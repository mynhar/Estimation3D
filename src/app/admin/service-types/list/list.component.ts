import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

interface Servicio {
  id:             number;
  codigo:         string;
  nombre_fr:      string;
  nombre_en:      string;
  nombre_es:      string;
  descripcion_fr: string | null;
  descripcion_en: string | null;
  descripcion_es: string | null;
  activo:         boolean;
}

type FiltroActivo = 'todos' | 'activo' | 'inactivo';

@Component({
  selector: 'app-admin-service-type-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl:    './list.component.css',
})
export class AdminServiceTypeListComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);
  private router    = inject(Router);

  private _servicios = signal<Servicio[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroActivo = signal<FiltroActivo>('todos');

  readonly estadosActivo: FiltroActivo[] = ['todos', 'activo', 'inactivo'];

  readonly POR_PAGINA = 10;
  paginaActual = signal(1);

  serviciosFiltrados = computed(() => {
    const q      = this.busqueda().toLowerCase().trim();
    const activo = this.filtroActivo();

    return this._servicios().filter(s => {
      if (activo === 'activo'   && !s.activo) return false;
      if (activo === 'inactivo' &&  s.activo) return false;
      if (q) {
        const nombre = this.servicioNombre(s).toLowerCase();
        const desc   = this.servicioDescripcion(s).toLowerCase();
        if (!nombre.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  });

  serviciosPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.serviciosFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' || this.filtroActivo() !== 'todos'
  );

  get total(): number { return this._servicios().length; }

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroActivo();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit() {
    try {
      const { data, error } = await this.auth.client
        .from('servicio')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      this._servicios.set(data ?? []);
    } catch (e: any) {
      this.error.set(e.message ?? this.translate.instant('admin_service_types.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroActivo.set('todos');
  }

  setBusqueda(e: Event) {
    this.busqueda.set((e.target as HTMLInputElement).value);
  }

  servicioNombre(s: Servicio): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return s.nombre_en || s.nombre_es;
    if (lang === 'fr') return s.nombre_fr || s.nombre_es;
    return s.nombre_es;
  }

  servicioDescripcion(s: Servicio): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return s.descripcion_en || s.descripcion_es || '';
    if (lang === 'fr') return s.descripcion_fr || s.descripcion_es || '';
    return s.descripcion_es || '';
  }

  /** Navega a la edición del servicio (fila/tarjeta completa clicable). */
  irAEditar(id: number): void {
    this.router.navigate(['/admin/service-type/edit', id]);
  }
}
