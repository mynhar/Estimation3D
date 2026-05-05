import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow } from '../../models';

@Component({
  selector: 'app-files-to-be-estimated',
  standalone: true,
  imports: [],
  template: `
    <div class="container py-4">

      <div class="mb-4">
        <h4 class="fw-semibold mb-1">Expedientes a estimar</h4>
        <p class="text-muted mb-0">Seleccione un expediente y envíe su estimación.</p>
      </div>

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expedientes…</div>
      } @else if (expedientes().length === 0) {
        <div class="card border-0 shadow-sm">
          <div class="card-body text-center py-5 text-muted">
            No hay expedientes nuevos pendientes de estimación.
          </div>
        </div>
      } @else {
        <div class="card border-0 shadow-sm">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th class="ps-4">Número</th>
                  <th>Servicio</th>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Fecha visita</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (exp of expedientes(); track exp.id) {
                  <tr>
                    <td class="ps-4 fw-semibold">{{ exp.numero }}</td>
                    <td>{{ exp.servicio_nombre }}</td>
                    <td>{{ exp.cliente_nombre }}</td>
                    <td class="text-muted small">
                      <div>{{ exp.direccion }}</div>
                      <div>{{ exp.provincia }}, {{ exp.canton }}, {{ exp.distrito }}</div>
                    </td>
                    <td>
                      <div>{{ formatFecha(exp.fecha_visita) }}</div>
                      <div class="text-muted small">{{ formatHora(exp.fecha_visita) }}</div>
                    </td>
                    <td class="pe-4 text-end">
                      <button class="btn btn-primary btn-sm" (click)="estimar(exp.id)">
                        Estimar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </div>
  `,
})
export class FilesToBeEstimatedComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteRow[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    try {
      this.expedientes.set(await this.expedienteService.getExpedienteRows({ estado: 'nuevo' }));
    } catch (e: any) {
      console.error('[FilesToBeEstimated]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  async estimar(id: string) {
    const userId = this.user()?.id;
    if (!userId) return;
    try {
      await this.expedienteService.asignarEstimador(id, userId);
      this.router.navigate(['/estimator/file-to-be-estimated', id]);
    } catch (e: any) {
      console.error('[FilesToBeEstimated] estimar:', e.message);
    }
  }
}
