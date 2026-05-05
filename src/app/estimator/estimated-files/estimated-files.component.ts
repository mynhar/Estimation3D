import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow, ESTADOS_ESTIMADO, ESTADO_BADGE_ESTIMADOR, ESTADO_LABEL_ESTIMADOR } from '../../models';

@Component({
  selector: 'app-estimated-files',
  standalone: true,
  imports: [],
  template: `
    <div class="container py-4">

      <div class="mb-4">
        <h4 class="fw-semibold mb-1">Estimaciones completadas. Expedientes estimados.</h4>
        <p class="text-muted mb-0">Seleccione un expediente. Revise su información.</p>
      </div>

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expedientes…</div>
      } @else if (expedientes().length === 0) {
        <div class="card border-0 shadow-sm">
          <div class="card-body text-center py-5 text-muted">
            No hay expedientes estimados aún.
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
                  <th>Estado</th>
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
                    <td>
                      <span class="badge rounded-pill px-3 py-2 {{ badgeClass(exp.estado) }}">
                        {{ estadoLabel(exp.estado) }}
                      </span>
                    </td>
                    <td class="pe-4 text-end">
                      <button class="btn btn-outline-primary btn-sm" (click)="ver(exp.id)">
                        Ver
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
export class EstimatedFilesComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteRow[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.expedientes.set(await this.expedienteService.getExpedienteRows({
        estados:     ESTADOS_ESTIMADO,
        estimadorId: userId,
      }));
    } catch (e: any) {
      console.error('[EstimatedFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  badgeClass(estado: string | undefined): string {
    return ESTADO_BADGE_ESTIMADOR[estado ?? ''] ?? 'bg-light text-dark';
  }

  estadoLabel(estado: string | undefined): string {
    return ESTADO_LABEL_ESTIMADOR[estado ?? ''] ?? estado ?? '';
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }

  ver(id: string) {
    this.router.navigate(['/estimator/estimated-file', id]);
  }
}
