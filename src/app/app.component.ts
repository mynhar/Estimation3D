import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { RealtimeNotificationsService } from './services/realtime-notifications.service';
import { ToastComponent } from './components/toast/toast.component';
import { LangToggleComponent } from './components/lang-toggle/lang-toggle.component';
import { AppFooterComponent } from './components/app-footer/app-footer.component';
import { ClaudeIconComponent } from './shared/ui/claude-icon/claude-icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, TranslatePipe, LangToggleComponent, AppFooterComponent, ClaudeIconComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private authService            = inject(AuthSupabaseService);
  private realtimeNotifications  = inject(RealtimeNotificationsService);
  private router                 = inject(Router);

  user      = toSignal(this.authService.user$);
  rolPerfil = toSignal(this.authService.rol$);

  // true mientras el usuario existe pero el rol aún no llegó del servidor
  cargandoPerfil = computed(() => !!this.user() && this.rolPerfil() === undefined);

  nombrePerfil = signal<string | null>(null);
  avatarPerfil = signal<string | null>(null);

  esCliente       = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'cliente');
  esEstimador     = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'estimador');
  esConstructor   = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'constructor');
  esAdministrador = computed(() => !this.cargandoPerfil() && this.rolPerfil() === 'administrador');

  rolLabel = computed(() => 'role.' + (this.rolPerfil() ?? 'cliente'));

  // ── Sitio público ─────────────────────────────────────────────────────────
  /**
   * true en las rutas marcadas con `data: { publicSite: true }` (Le Journal,
   * Entrepreneurs). Esas páginas traen su propia cabecera y su propio pie, y
   * deben verse igual con sesión o sin ella.
   */
  private sitioPublico = signal(false);

  /** El armazón de la app sólo se monta con sesión y fuera del sitio público. */
  mostrarArmazon = computed(() => !!this.user() && !this.sitioPublico());

  // ── Sidebar state ─────────────────────────────────────────────────────────
  collapsed  = signal(localStorage.getItem('sidebar-collapsed') === 'true');
  mobileOpen = signal(false);

  constructor() {
    // El flag viaja en la ruta hoja: se baja hasta la más profunda porque las
    // rutas con hijos dejan `data` vacío en los niveles superiores.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        let ruta = this.router.routerState.root;
        while (ruta.firstChild) ruta = ruta.firstChild;
        this.sitioPublico.set(ruta.snapshot.data['publicSite'] === true);
        if (this.sitioPublico()) this.mobileOpen.set(false);
      });

    // Iniciar/detener notificaciones según rol resuelto
    this.authService.rol$.pipe(takeUntilDestroyed()).subscribe(rol => {
      if (rol) {
        const userId = this.user()?.id;
        if (userId) this.realtimeNotifications.iniciar(userId, rol);
      } else if (rol === null) {
        this.realtimeNotifications.detener();
        this.mobileOpen.set(false);
      }
    });

    // Actualizar display de nombre y avatar desde el caché de perfil
    this.authService.perfilCache$.pipe(takeUntilDestroyed()).subscribe(perfil => {
      if (perfil) {
        const completo = [perfil.nombre.trim(), perfil.apellido.trim()].filter(Boolean).join(' ');
        this.nombrePerfil.set(completo || null);
        this.avatarPerfil.set(perfil.avatar_url);
      } else {
        this.nombrePerfil.set(null);
        this.avatarPerfil.set(null);
      }
    });
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

  irAHome(): void {
    const rol = this.rolPerfil();
    if (rol === 'administrador') this.router.navigateByUrl('/admin/dashboard');
    else if (rol === 'constructor') this.router.navigateByUrl('/builder/dashboard');
    else if (rol === 'estimador')   this.router.navigateByUrl('/estimator/dashboard');
    else this.router.navigateByUrl('/client/dashboard');
  }

  async logout(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
