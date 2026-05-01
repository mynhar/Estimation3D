import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from './services/auth-supabase.service';

const ROLES_ESTIMADOR = ['estimador', 'administrador'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'estimation3d-A18-v01';

  private authService = inject(AuthSupabaseService);
  private router      = inject(Router);

  user        = toSignal(this.authService.user$);
  rolPerfil   = signal<string | null>(null);
  esEstimador = computed(() =>
    ROLES_ESTIMADOR.includes(this.rolPerfil() ?? '')
  );

  constructor() {
    // Suscripción directa: BehaviorSubject emite el valor actual inmediatamente
    this.authService.user$
      .pipe(takeUntilDestroyed())
      .subscribe(user => {
        if (user) {
          this.cargarRol(user.id);
        } else {
          this.rolPerfil.set(null);
        }
      });
  }

  private async cargarRol(userId: string) {
    const { data, error } = await this.authService.client
      .from('perfil')
      .select('rol')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.message?.includes('infinite recursion')) {
        console.error('[AppComponent] RLS recursivo en tabla perfil. Ejecuta el fix de políticas en Supabase.');
      } else {
        console.error('[AppComponent] cargarRol error:', error.message);
      }
      this.rolPerfil.set(null);
      return;
    }

    this.rolPerfil.set(data?.rol ?? null);
  }

  async logout() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
