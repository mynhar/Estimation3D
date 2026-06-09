import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { DbPerfil, RolUsuario, ProveedorAuth } from '../../../types/supabase';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

type FiltroActivo = 'todos' | 'activo' | 'inactivo';

const ROL_BADGE_CLASS: Record<string, string> = {
  administrador: 'role-badge role-badge--administrador',
  estimador:     'role-badge role-badge--estimador',
  constructor:   'role-badge role-badge--constructor',
  cliente:       'role-badge role-badge--cliente',
};

@Component({
  selector: 'app-admin-user-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminUserListComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);
  private route     = inject(ActivatedRoute);

  private _usuarios = signal<DbPerfil[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  busqueda        = signal('');
  filtroRol       = signal<RolUsuario | 'todos'>('todos');
  filtroProveedor = signal<ProveedorAuth | 'todos'>('todos');
  filtroActivo    = signal<FiltroActivo>('todos');

  readonly roles: Array<RolUsuario | 'todos'>          = ['todos', 'cliente', 'estimador', 'constructor', 'administrador'];
  readonly proveedores: Array<ProveedorAuth | 'todos'> = ['todos', 'email', 'google'];
  readonly estadosActivo: FiltroActivo[]               = ['todos', 'activo', 'inactivo'];

  readonly POR_PAGINA = 15;
  paginaActual = signal(1);

  usuariosFiltrados = computed(() => {
    const q         = this.busqueda().toLowerCase().trim();
    const rol       = this.filtroRol();
    const proveedor = this.filtroProveedor();
    const activo    = this.filtroActivo();

    return this._usuarios().filter(u => {
      if (q && !`${u.nombre} ${u.apellido} ${u.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (rol       !== 'todos' && u.rol       !== rol)       return false;
      if (proveedor !== 'todos' && u.proveedor !== proveedor) return false;
      if (activo === 'activo'   && !u.activo) return false;
      if (activo === 'inactivo' &&  u.activo) return false;
      return true;
    });
  });

  usuariosPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.usuariosFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' ||
    this.filtroRol()       !== 'todos' ||
    this.filtroProveedor() !== 'todos' ||
    this.filtroActivo()    !== 'todos'
  );

  get totalUsuarios(): number { return this._usuarios().length; }

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
    const rolParam = this.route.snapshot.queryParamMap.get('rol');
    if (rolParam && (this.roles as string[]).includes(rolParam)) {
      this.filtroRol.set(rolParam as RolUsuario);
    }

    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('*')
        .order('creado_en', { ascending: false });

      if (error) throw error;
      this._usuarios.set(data ?? []);
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

  rolBadgeClass(rol: string): string {
    return ROL_BADGE_CLASS[rol] ?? 'role-badge role-badge--cliente';
  }
}
