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
}

const ESTADOS_ESTIMADO = ['estimado', 'en_oferta', 'adjudicado', 'contratado', 'cancelado'];

const ESTADO_BADGE: Record<string, string> = {
  estimado:   'bg-success-subtle text-success',
  en_oferta:  'bg-primary-subtle text-primary',
  adjudicado: 'bg-warning-subtle text-warning-emphasis',
  contratado: 'bg-info-subtle text-info-emphasis',
  cancelado:  'bg-secondary-subtle text-secondary',
};

const ESTADO_LABEL: Record<string, string> = {
  estimado:   'Estimado',
  en_oferta:  'En oferta',
  adjudicado: 'Adjudicado',
  contratado: 'Contratado',
  cancelado:  'Cancelado',
};

@Component({
  selector: 'app-estimated-files',
  standalone: true,
  imports: [],
  template: `
    <div class="container py-4">

      <div class="mb-4">
        <h4 class="fw-semibold mb-1">Expedientes estimados</h4>
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
                    <td class="text-muted small">{{ exp.direccion }}</td>
                    <td>{{ formatFecha(exp.fecha_visita) }}</td>
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
        .in('estado', ESTADOS_ESTIMADO)
        .eq('estimador_id', user.id)
        .order('id', { ascending: false });

      if (expError) throw expError;
      if (!exps?.length) { this.cargando.set(false); return; }

      const clienteIds    = [...new Set(exps.map(e => e.cliente_id))];
      const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
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
          .select('expediente_id, direccion')
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
        };
      });

      this.expedientes.set(rows);
    } catch (e: any) {
      console.error('[EstimatedFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  badgeClass(estado: string): string {
    return ESTADO_BADGE[estado] ?? 'bg-light text-dark';
  }

  estadoLabel(estado: string): string {
    return ESTADO_LABEL[estado] ?? estado;
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  ver(id: string) {
    this.router.navigate(['/estimator/file-to-be-estimated', id]);
  }
}
