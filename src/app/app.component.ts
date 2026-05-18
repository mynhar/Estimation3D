import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Router } from '@angular/router';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { ExpedienteService } from './services/expediente.service';
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

  private authService       = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  user           = toSignal(this.authService.user$);
  rolPerfil      = signal<RolUsuario | null>(null);
  nombrePerfil   = signal<string | null>(null);
  avatarPerfil   = signal<string | null>(null);
  cargandoPerfil = signal(false);

  esCliente       = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'cliente');
  esEstimador     = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'estimador');
  esConstructor   = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'constructor');
  esAdministrador = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'administrador');

  rolLabel = computed(() => {
    const r = this.rolPerfil();
    if (r === 'administrador') return 'Administrador';
    if (r === 'constructor')   return 'Constructor';
    if (r === 'estimador')     return 'Estimador';
    return 'Cliente';
  });

  // ── Sidebar state ─────────────────────────────────────────────────────────
  collapsed  = signal(localStorage.getItem('sidebar-collapsed') === 'true');
  mobileOpen = signal(false);

  constructor() {
    this.authService.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
      if (user) {
        this.cargandoPerfil.set(true);
        this.cargarRol(user.id);
      } else {
        this.rolPerfil.set(null);
        this.nombrePerfil.set(null);
        this.avatarPerfil.set(null);
        this.cargandoPerfil.set(false);
        this.mobileOpen.set(false);
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

  // ── Sidebar togglers ──────────────────────────────────────────────────────

  toggleCollapse(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  }

  toggleMobile(): void { this.mobileOpen.update(v => !v); }
  closeMobile():  void { this.mobileOpen.set(false); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.mobileOpen.set(false); }

  // ── Navegación home según conteo de expedientes ───────────────────────────

  async irAHome(): Promise<void> {
    if (this.esCliente()) {
      const userId = this.user()?.id;
      if (!userId) { this.router.navigateByUrl('/client/dashboard'); return; }
      try {
        const { primeroId, hayMasDeUno } = await this.expedienteService.contarExpedientesCliente(userId);
        if (!hayMasDeUno && primeroId) {
          this.router.navigateByUrl(`/client/file/my-file/${primeroId}`);
        } else {
          this.router.navigateByUrl('/client/dashboard');
        }
      } catch {
        this.router.navigateByUrl('/client/dashboard');
      }
      return;
    }
    const rol = this.rolPerfil();
    if (rol === 'administrador') this.router.navigateByUrl('/admin/dashboard');
    else if (rol === 'constructor') this.router.navigateByUrl('/builder/dashboard');
    else if (rol === 'estimador')   this.router.navigateByUrl('/estimator/dashboard');
    else this.router.navigateByUrl('/client/dashboard');
  }

  // ── Carga de perfil ───────────────────────────────────────────────────────

  private async cargarRol(userId: string): Promise<void> {
    try {
      const { data, error } = await this.authService.client
        .from('perfil')
        .select('rol, nombre, apellido, avatar_url')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.message?.includes('infinite recursion')) {
          console.error('[AppComponent] RLS recursivo en tabla perfil.');
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
      this.nombrePerfil.set([nombre, apellido].filter(Boolean).join(' ') || null);
    } finally {
      this.cargandoPerfil.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
