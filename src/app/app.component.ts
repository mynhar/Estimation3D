import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { ToastComponent } from './components/toast/toast.component';
import { RolUsuario } from './types/supabase';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'Estimation3D';

  private authService = inject(AuthSupabaseService);
  private router = inject(Router);

  user            = toSignal(this.authService.user$);
  rolPerfil       = signal<RolUsuario | null>(null);
  nombrePerfil    = signal<string | null>(null);
  avatarPerfil    = signal<string | null>(null);
  cargandoPerfil  = signal(false);
  esCliente       = computed(() => { const r = this.rolPerfil(); return !this.cargandoPerfil() && r === 'cliente';       });
  esEstimador     = computed(() => { const r = this.rolPerfil(); return !this.cargandoPerfil() && r === 'estimador';     });
  esConstructor   = computed(() => { const r = this.rolPerfil(); return !this.cargandoPerfil() && r === 'constructor';   });
  esAdministrador = computed(() => { const r = this.rolPerfil(); return !this.cargandoPerfil() && r === 'administrador'; });

  dashboardRoute = computed(() => {
    const rol = this.rolPerfil();
    if (rol === 'administrador') return '/admin/dashboard';
    if (rol === 'constructor')   return '/builder/dashboard';
    if (rol === 'estimador')     return '/estimator/dashboard';
    return '/client/dashboard';
  });

  constructor() {
    // Suscripción directa: BehaviorSubject emite el valor actual inmediatamente
    this.authService.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
      if (user) {
        this.cargandoPerfil.set(true);
        this.cargarRol(user.id);
      } else {
        this.rolPerfil.set(null);
        this.nombrePerfil.set(null);
        this.avatarPerfil.set(null);
        this.cargandoPerfil.set(false);
      }
    });

    this.authService.perfilEditado$
      .pipe(takeUntilDestroyed())
      .subscribe(({ nombre, apellido }) => {
        const completo = [nombre.trim(), apellido.trim()].filter(Boolean).join(' ');
        this.nombrePerfil.set(completo || null);
      });

    this.authService.avatarActualizado$
      .pipe(takeUntilDestroyed())
      .subscribe(url => this.avatarPerfil.set(url || null));
  }

  private async cargarRol(userId: string) {
    try {
      const { data, error } = await this.authService.client
        .from('perfil')
        .select('rol, nombre, apellido, avatar_url')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.message?.includes('infinite recursion')) {
          console.error(
            '[AppComponent] RLS recursivo en tabla perfil. Ejecuta el fix de políticas en Supabase.',
          );
        } else {
          console.error('[AppComponent] cargarRol error:', error.message);
        }
        this.rolPerfil.set(null);
        return;
      }

      this.rolPerfil.set(data?.rol ?? null);
      this.avatarPerfil.set(data?.avatar_url ?? null);
      const nombre   = data?.nombre?.trim()   ?? '';
      const apellido = data?.apellido?.trim() ?? '';
      const nombre_completo = [nombre, apellido].filter(Boolean).join(' ');
      this.nombrePerfil.set(nombre_completo || null);
    } finally {
      this.cargandoPerfil.set(false);
    }
  }

  async logout() {
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
