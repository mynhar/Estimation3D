import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';

interface Expediente {
  id: number;
  numero: string;
  estado: string;
  fecha_visita: string;
  descripcion: string;
  servicio: { nombre_es: string };
}

const ESTADO_LABEL: Record<string, { texto: string; clase: string }> = {
  nuevo:     { texto: 'Nuevo',     clase: 'bg-primary' },
  asignado:  { texto: 'Asignado',  clase: 'bg-warning text-dark' },
  en_proceso:{ texto: 'En proceso',clase: 'bg-info text-dark' },
  completado:{ texto: 'Completado',clase: 'bg-success' },
  cancelado: { texto: 'Cancelado', clase: 'bg-secondary' },
};

@Component({
  selector: 'app-my-files',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container py-4">

      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 class="fw-semibold mb-1">Mis Expedientes</h4>
          <p class="text-muted mb-0 small">Historial de expedientes creados</p>
        </div>
        <a routerLink="/client/file/create" class="btn btn-primary btn-sm">
          + Nuevo expediente
        </a>
      </div>

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expedientes…</div>
      } @else if (expedientes().length === 0) {
        <div class="card border-0 shadow-sm">
          <div class="card-body text-center py-5 text-muted">
            <p class="mb-3">No tienes expedientes registrados aún.</p>
            <a routerLink="/client/file/create" class="btn btn-primary btn-sm">
              Crear primer expediente
            </a>
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
                  <th>Fecha visita</th>
                  <th>Estado</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                @for (exp of expedientes(); track exp.id) {
                  <tr>
                    <td class="ps-4 fw-semibold">{{ exp.numero }}</td>
                    <td>{{ exp.servicio?.nombre_es ?? '—' }}</td>
                    <td>{{ formatFecha(exp.fecha_visita) }}</td>
                    <td>
                      <span class="badge {{ estadoClase(exp.estado) }}">
                        {{ estadoTexto(exp.estado) }}
                      </span>
                    </td>
                    <td class="text-muted small" style="max-width:260px">
                      {{ exp.descripcion || '—' }}
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
export class MyFilesComponent implements OnInit {
  private auth   = inject(AuthSupabaseService);
  private router = inject(Router);

  user = toSignal(this.auth.user$);

  expedientes = signal<Expediente[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }

    const { data, error } = await this.auth.client
      .from('expediente')
      .select('id, numero, estado, fecha_visita, descripcion, servicio:servicio_id(nombre_es)')
      .eq('cliente_id', userId)
      .order('id', { ascending: false });

    if (error) console.error('[MyFiles] error:', error.message);
    this.expedientes.set((data ?? []) as unknown as Expediente[]);
    this.cargando.set(false);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  estadoTexto(estado: string): string {
    return ESTADO_LABEL[estado]?.texto ?? estado;
  }

  estadoClase(estado: string): string {
    return ESTADO_LABEL[estado]?.clase ?? 'bg-secondary';
  }
}
