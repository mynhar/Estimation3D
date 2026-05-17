import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [],
  template: `
    <div class="container py-4">
      <h2><i class="bi bi-shield-lock me-2 text-danger"></i>Dashboard Administrador</h2>
      <p class="text-muted">Panel de administración — próximamente.</p>
    </div>
  `,
})
export class AdminDashboardComponent {}
