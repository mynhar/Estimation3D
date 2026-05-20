import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="landing-wrapper d-flex flex-column min-vh-100">

      <nav class="navbar px-4 py-3">
        <span class="navbar-brand fw-bold fs-5">Estimation 3D</span>
        <a routerLink="/login" class="btn btn-outline-primary btn-sm">{{ 'auth.sign_in' | translate }}</a>
      </nav>

      <main class="flex-grow-1 d-flex align-items-center justify-content-center text-center px-3">
        <div class="hero">
          <h1 class="display-5 fw-bold mb-3">{{ 'landing.title' | translate }}</h1>
          <p class="lead text-muted mb-4 mx-auto" style="max-width: 480px">
            {{ 'landing.subtitle' | translate }}
          </p>
          <a routerLink="/login" class="btn btn-primary btn-lg px-5">
            {{ 'landing.cta' | translate }}
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
