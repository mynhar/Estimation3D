import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface ExpedienteRow {
  id: string;
  numero: string;
  fecha_visita: string;
  estado: string;
  servicio_nombre: string;
  cliente_nombre: string;
  direccion: string;
  provincia: string;
  canton: string;
  distrito: string;
}

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
  private auth   = inject(AuthSupabaseService);
  private router = inject(Router);

  expedientes = signal<ExpedienteRow[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) return;

      const { data: exps, error: expError } = await this.auth.client
        .from('expediente')
        .select('id, numero, fecha_visita, estado, cliente_id, servicio_id')
        .eq('estado', 'en_estimacion')
        .eq('estimador_id', user.id)
        .order('id', { ascending: false });

      if (expError) throw expError;
      if (!exps?.length) { this.cargando.set(false); return; }

      const clienteIds   = [...new Set(exps.map(e => e.cliente_id))];
      const servicioIds  = [...new Set(exps.map(e => e.servicio_id))];
      const expedienteIds = exps.map(e => e.id);

      const [perfilesRes, serviciosRes, locRes] = await Promise.all([
        this.auth.client
          .from('perfil')
          .select('id, nombre, apellido')
          .in('id', clienteIds),
        this.auth.client
          .from('servicio')
          .select('id, nombre_es')
          .in('id', servicioIds),
        this.auth.client
          .from('localizacion')
          .select('expediente_id, direccion, provincia, canton, distrito')
          .in('expediente_id', expedienteIds),
      ]);

      const perfiles  = perfilesRes.data  ?? [];
      const servicios = serviciosRes.data ?? [];
      const locs      = locRes.data       ?? [];

      const rows: ExpedienteRow[] = exps.map(e => {
        const perfil   = perfiles.find((p: any) => String(p.id) === String(e.cliente_id));
        const servicio = servicios.find((s: any) => String(s.id) === String(e.servicio_id));
        const loc      = locs.find((l: any) => String(l.expediente_id) === String(e.id));

        return {
          id:              e.id,
          numero:          e.numero,
          fecha_visita:    e.fecha_visita,
          estado:          e.estado,
          servicio_nombre: servicio?.nombre_es ?? '—',
          cliente_nombre:  perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
          direccion:       loc?.direccion ?? '—',
          provincia:       loc?.provincia  ?? '—',
          canton:          loc?.canton     ?? '—',
          distrito:        loc?.distrito   ?? '—',
        };
      });

      this.expedientes.set(rows);
    } catch (e: any) {
      console.error('[FilesUnderEstimation]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  estimar(id: string) {
    this.router.navigate(['/estimator/file-under-estimation', id]);
  }

  async liberar(id: string) {
    const { error } = await this.auth.client
      .from('expediente')
      .update({ estado: 'nuevo', estimador_id: null })
      .eq('id', id);

    if (error) {
      console.error('[FilesUnderEstimation] liberar:', error.message);
      return;
    }

    this.expedientes.update(rows => rows.filter(e => e.id !== id));
  }
}
