import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ImprevistoCatalogoRepository, ImprevistoCatalogo } from '../../../data';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

type FiltroActivo = 'todos' | 'activo' | 'inactivo';

@Component({
  selector: 'app-admin-imprevistos-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrls: ['../../_shared/crud-list.css'],
})
export class AdminImprevistosListComponent implements OnInit {
  private repo      = inject(ImprevistoCatalogoRepository);
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);
  private router    = inject(Router);

  private _items = signal<ImprevistoCatalogo[]>([]);
  private servicios = signal<Map<number, { fr: string; en: string; es: string }>>(new Map());
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda     = signal('');
  filtroActivo = signal<FiltroActivo>('todos');
  readonly estadosActivo: FiltroActivo[] = ['todos', 'activo', 'inactivo'];

  readonly POR_PAGINA = 10;
  paginaActual = signal(1);

  itemsFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const a = this.filtroActivo();
    return this._items().filter(it => {
      if (a === 'activo'   && !it.activo) return false;
      if (a === 'inactivo' &&  it.activo) return false;
      if (q) {
        const t = this.titulo(it).toLowerCase();
        const s = this.servicioNombre(it).toLowerCase();
        if (!t.includes(q) && !it.codigo.toLowerCase().includes(q) && !s.includes(q)) return false;
      }
      return true;
    });
  });

  itemsPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.itemsFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() => this.busqueda() !== '' || this.filtroActivo() !== 'todos');
  get total(): number { return this._items().length; }

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroActivo();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit() {
    try {
      const [items, { data: servs }] = await Promise.all([
        this.repo.findAll(),
        this.auth.client.from('servicio').select('id, nombre_fr, nombre_en, nombre_es'),
      ]);
      this._items.set(items);
      const map = new Map<number, { fr: string; en: string; es: string }>();
      for (const s of servs ?? []) map.set(s.id, { fr: s.nombre_fr, en: s.nombre_en, es: s.nombre_es });
      this.servicios.set(map);
    } catch (e: any) {
      this.error.set(e?.message ?? this.translate.instant('admin_imprevistos.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros() { this.busqueda.set(''); this.filtroActivo.set('todos'); }
  setBusqueda(e: Event) { this.busqueda.set((e.target as HTMLInputElement).value); }

  private lang(): string { return (this.translate.currentLang || 'fr').slice(0, 2); }

  titulo(it: ImprevistoCatalogo): string {
    const l = this.lang();
    return l === 'en' ? it.titulo_en : l === 'es' ? it.titulo_es : it.titulo_fr;
  }

  servicioNombre(it: ImprevistoCatalogo): string {
    if (it.servicio_id == null) return this.translate.instant('admin_imprevistos.general');
    const s = this.servicios().get(it.servicio_id);
    if (!s) return '—';
    const l = this.lang();
    return l === 'en' ? s.en : l === 'es' ? s.es : s.fr;
  }

  irAEditar(id: number) { this.router.navigate(['/admin/imprevisto/edit', id]); }
}
