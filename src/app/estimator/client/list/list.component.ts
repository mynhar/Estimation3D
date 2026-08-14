import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { DbPerfil, ProveedorAuth, RolUsuario } from '../../../types/supabase';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

type FiltroActivo = 'todos' | 'activo' | 'inactivo';

/** El estimador gestiona los dos roles externos; el resto no es asunto suyo. */
type RolExterno = Extract<RolUsuario, 'cliente' | 'constructor'>;

@Component({
  selector: 'app-estimator-client-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class EstimatorClientListComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);
  private router    = inject(Router);

  private _clientes = signal<DbPerfil[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda        = signal('');
  filtroRol       = signal<RolExterno | 'todos'>('todos');
  filtroProveedor = signal<ProveedorAuth | 'todos'>('todos');
  filtroActivo    = signal<FiltroActivo>('todos');

  readonly rolesFiltro: Array<RolExterno | 'todos'>    = ['todos', 'cliente', 'constructor'];
  readonly proveedores: Array<ProveedorAuth | 'todos'> = ['todos', 'email', 'google'];
  readonly estadosActivo: FiltroActivo[]               = ['todos', 'activo', 'inactivo'];

  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  clientesFiltrados = computed(() => {
    const q         = this.busqueda().toLowerCase().trim();
    const rol       = this.filtroRol();
    const proveedor = this.filtroProveedor();
    const activo    = this.filtroActivo();

    return this._clientes().filter(u => {
      if (q && !`${u.nombre} ${u.apellido} ${u.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (rol !== 'todos' && u.rol !== rol) return false;
      if (proveedor !== 'todos' && u.proveedor !== proveedor) return false;
      if (activo === 'activo'   && !u.activo) return false;
      if (activo === 'inactivo' &&  u.activo) return false;
      return true;
    });
  });

  clientesPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.clientesFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' ||
    this.filtroRol()       !== 'todos' ||
    this.filtroProveedor() !== 'todos' ||
    this.filtroActivo()    !== 'todos'
  );

  get totalClientes(): number { return this._clientes().length; }

  constructor() {
    effect(() => {
      this.busqueda();
      this.filtroRol();
      this.filtroProveedor();
      this.filtroActivo();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('*')
        .in('rol', ['cliente', 'constructor'])
        .order('creado_en', { ascending: false });

      if (error) throw error;
      this._clientes.set(data ?? []);
    } catch (e: any) {
      this.error.set(e.message ?? this.translate.instant('admin_users.err_load_list'));
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroRol.set('todos');
    this.filtroProveedor.set('todos');
    this.filtroActivo.set('todos');
  }

  setBusqueda(e: Event): void {
    this.busqueda.set((e.target as HTMLInputElement).value);
  }

  avatarFallback(u: DbPerfil): string {
    const n = u.nombre?.[0] ?? '';
    const a = u.apellido?.[0] ?? '';
    return (n + a).toUpperCase() || '?';
  }

  /** Clave i18n del título de edición, acorde al rol de la fila. */
  tituloEditar(rol: RolUsuario): string {
    return rol === 'constructor'
      ? 'admin_users.edit_builder_title'
      : 'admin_users.edit_client_title';
  }

  rolBadgeClass(rol: RolUsuario): string {
    return rol === 'constructor'
      ? 'role-badge role-badge--constructor'
      : 'role-badge role-badge--cliente';
  }

  /** Navega a la edición del usuario (fila/tarjeta completa clicable). */
  irAEditar(id: string): void {
    this.router.navigate(['/estimator/client/edit', id]);
  }
}
