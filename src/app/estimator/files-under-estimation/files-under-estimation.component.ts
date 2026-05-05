import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow } from '../../models';

@Component({
  selector: 'app-files-under-estimation',
  standalone: true,
  imports: [],
  template: `
    <div class="container py-4">

      <div class="mb-4">
        <h4 class="fw-semibold mb-1">Expedientes en estimación</h4>
        <p class="text-muted mb-0">Seleccione un expediente y envíe su estimación.</p>
      </div>

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expedientes…</div>
      } @else if (expedientes().length === 0) {
        <div class="card border-0 shadow-sm">
          <div class="card-body text-center py-5 text-muted">
            No hay expedientes en proceso de estimación.
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
                      <div class="d-flex gap-2 justify-content-end">
                        <button class="btn btn-primary btn-sm" (click)="estimar(exp.id)">
                          Estimar
                        </button>
                        @if (exp.estado === 'en_estimacion') {
                          <button class="btn btn-outline-danger btn-sm" (click)="liberar(exp.id)">
                            Eliminar
                          </button>
                        }
                      </div>
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
export class FilesUnderEstimationComponent implements OnInit {
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
        estado:       'en_estimacion',
        estimadorId:  userId,
      }));
    } catch (e: any) {
      console.error('[FilesUnderEstimation]', e.message);
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

  estimar(id: string) {
    this.router.navigate(['/estimator/file-under-estimation', id]);
  }

  async liberar(id: string) {
    try {
      await this.expedienteService.liberar(id);
      this.expedientes.update(rows => rows.filter(e => e.id !== id));
    } catch (e: any) {
      console.error('[FilesUnderEstimation] liberar:', e.message);
    }
  }
}
