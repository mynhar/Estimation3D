import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { DbPerfil, RolUsuario, ProveedorAuth } from '../../../types/supabase';

type FiltroActivo = 'todos' | 'activo' | 'inactivo';

@Component({
  selector: 'app-admin-user-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminUserListComponent implements OnInit {
  private _usuarios = signal<DbPerfil[]>([]);
  cargando = true;
  error: string | null = null;

  // Filtros reactivos
  busqueda        = signal('');
  filtroRol       = signal<RolUsuario | 'todos'>('todos');
  filtroProveedor = signal<ProveedorAuth | 'todos'>('todos');
  filtroActivo    = signal<FiltroActivo>('todos');

  readonly roles: Array<RolUsuario | 'todos'>       = ['todos', 'cliente', 'estimador', 'constructor', 'administrador'];
  readonly proveedores: Array<ProveedorAuth | 'todos'> = ['todos', 'email', 'google'];
  readonly estadosActivo: FiltroActivo[]             = ['todos', 'activo', 'inactivo'];

  usuariosFiltrados = computed(() => {
    const q          = this.busqueda().toLowerCase().trim();
    const rol        = this.filtroRol();
    const proveedor  = this.filtroProveedor();
    const activo     = this.filtroActivo();

    return this._usuarios().filter(u => {
      if (q && !`${u.nombre} ${u.apellido} ${u.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (rol       !== 'todos' && u.rol       !== rol)      return false;
      if (proveedor !== 'todos' && u.proveedor !== proveedor) return false;
      if (activo === 'activo'   && !u.activo)  return false;
      if (activo === 'inactivo' &&  u.activo)  return false;
      return true;
    });
  });

  hayFiltros = computed(() =>
    this.busqueda() !== '' ||
    this.filtroRol()       !== 'todos' ||
    this.filtroProveedor() !== 'todos' ||
    this.filtroActivo()    !== 'todos'
  );

  get totalUsuarios(): number { return this._usuarios().length; }

  private translate = inject(TranslateService);

  constructor(private auth: AuthSupabaseService) {}

  async ngOnInit(): Promise<void> {
    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      this._usuarios.set(data ?? []);
    } catch (e: any) {
      this.error = e.message ?? this.translate.instant('admin_users.err_load_list');
    } finally {
      this.cargando = false;
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

  rolClass(rol: string): string {
    const map: Record<string, string> = {
      administrador: 'bg-danger',
      estimador:     'bg-warning text-dark',
      constructor:   'bg-info text-dark',
      cliente:       'bg-primary',
    };
    return map[rol] ?? 'bg-secondary';
  }

  proveedorIcon(proveedor: string): string {
    return proveedor === 'google' ? 'bi-google text-danger' : 'bi-envelope-fill text-secondary';
  }
}
