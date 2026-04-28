import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="landing-wrapper d-flex flex-column min-vh-100">

      <nav class="navbar px-4 py-3">
        <span class="navbar-brand fw-bold fs-5">Estimation 3D</span>
        <a routerLink="/login" class="btn btn-outline-primary btn-sm">Iniciar sesión</a>
      </nav>

      <main class="flex-grow-1 d-flex align-items-center justify-content-center text-center px-3">
        <div class="hero">
          <h1 class="display-5 fw-bold mb-3">Estima tus proyectos 3D<br>con precisión</h1>
          <p class="lead text-muted mb-4 mx-auto" style="max-width: 480px">
            Calcula costos, tiempos y materiales para tus impresiones y diseños 3D de forma rápida y confiable.
          </p>
          <a routerLink="/login" class="btn btn-primary btn-lg px-5">
            Comenzar ahora
          </a>
        </div>
      </main>

      <footer class="text-center text-muted small py-3">
        &copy; {{ year }} Estimation 3D
      </footer>

    </div>
  `,
  styles: [`
    .landing-wrapper {
      background: #f8f9fa;
    }
    .navbar {
      background: #fff;
      border-bottom: 1px solid #e9ecef;
    }
    .hero h1 {
      line-height: 1.2;
    }
  `],
})
export class LandingPageComponent {
  year = new Date().getFullYear();
}
