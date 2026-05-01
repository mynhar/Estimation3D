import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface ExpedienteRow {
  id: string;
  numero: string;
  fecha_visita: string;
  servicio_nombre: string;
  cliente_nombre: string;
  direccion: string;
}

@Component({
  selector: 'app-files-to-be-estimated',
  standalone: true,
  imports: [RouterLink],
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
                    <td class="text-muted small">{{ exp.direccion }}</td>
                    <td>{{ formatFecha(exp.fecha_visita) }}</td>
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
  private auth   = inject(AuthSupabaseService);
  private router = inject(Router);

  expedientes = signal<ExpedienteRow[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    try {
      // Query 1: expedientes nuevos con servicio_id y cliente_id
      const { data: exps, error: expError } = await this.auth.client
        .from('expediente')
        .select('id, numero, fecha_visita, cliente_id, servicio_id')
        .eq('estado', 'nuevo')
        .order('id', { ascending: false });

      if (expError) throw expError;
      if (!exps?.length) { this.cargando.set(false); return; }

      // IDs únicos para queries paralelas
      const clienteIds  = [...new Set(exps.map(e => e.cliente_id))];
      const servicioIds = [...new Set(exps.map(e => e.servicio_id))];
      const expedienteIds = exps.map(e => e.id);

      // Queries 2-4 en paralelo
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
          .select('expediente_id, direccion')
          .in('expediente_id', expedienteIds),
      ]);

      const perfiles  = perfilesRes.data  ?? [];
      const servicios = serviciosRes.data ?? [];
      const locs      = locRes.data       ?? [];

      console.log('[FilesToBeEstimated] cliente_ids:', clienteIds);
      console.log('[FilesToBeEstimated] perfiles result:', perfiles, perfilesRes.error?.message);

      // Unir todo en memoria (String() evita mismatch número vs UUID)
      const rows: ExpedienteRow[] = exps.map(e => {
        const perfil   = perfiles.find((p: any) => String(p.id) === String(e.cliente_id));
        const servicio = servicios.find((s: any) => String(s.id) === String(e.servicio_id));
        const loc      = locs.find((l: any) => String(l.expediente_id) === String(e.id));

        return {
          id:              e.id,
          numero:          e.numero,
          fecha_visita:    e.fecha_visita,
          servicio_nombre: servicio?.nombre_es ?? '—',
          cliente_nombre:  perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
          direccion:       loc?.direccion ?? '—',
        };
      });

      this.expedientes.set(rows);
    } catch (e: any) {
      console.error('[FilesToBeEstimated]', e.message);
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

  async estimar(id: string) {
    const { data: { user } } = await this.auth.client.auth.getUser();

    await this.auth.client
      .from('expediente')
      .update({ estado: 'en_estimacion', estimador_id: user?.id })
      .eq('id', id);

    this.router.navigate(['/estimator/file-to-be-estimated', id]);
  }
}
