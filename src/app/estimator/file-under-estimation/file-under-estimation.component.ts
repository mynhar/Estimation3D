import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface ExpedienteDetalle {
  numero: string;
  fecha_visita: string;
  servicio_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion: string;
}

@Component({
  selector: 'app-file-under-estimation',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="container py-4" style="max-width: 720px">

      @if (cargando()) {
        <div class="text-center py-5 text-muted">Cargando expediente…</div>
      } @else if (!detalle()) {
        <div class="alert alert-warning">
          No se encontró el expediente.
          @if (errorMsg()) {
            <br/><small class="text-danger">{{ errorMsg() }}</small>
          }
        </div>
      } @else {

        <div class="mb-4 d-flex align-items-center gap-3">
          <button class="btn btn-outline-secondary btn-sm" (click)="volver()">
            ← Volver
          </button>
          <h4 class="fw-semibold mb-0">Estimar Expediente</h4>
        </div>

        <!-- Detalles del expediente -->
        <div class="card border-0 shadow-sm">
          <div class="card-body p-4">
            <div class="row g-4">

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Número</p>
                <p class="fw-semibold mb-0">{{ detalle()!.numero }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Servicio</p>
                <p class="fw-semibold mb-0">{{ detalle()!.servicio_nombre }}</p>
              </div>

              <div class="col-12"><hr class="my-0" /></div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Cliente</p>
                <p class="fw-semibold mb-0">{{ detalle()!.cliente_nombre }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Teléfono</p>
                <p class="fw-semibold mb-0">{{ detalle()!.cliente_telefono || '—' }}</p>
              </div>

              <div class="col-12"><hr class="my-0" /></div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Dirección</p>
                <p class="fw-semibold mb-0">{{ detalle()!.direccion }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Fecha de visita</p>
                <p class="fw-semibold mb-0">{{ formatFecha(detalle()!.fecha_visita) }}</p>
              </div>

              <div class="col-sm-6">
                <p class="text-muted small mb-1">Hora de visita</p>
                <p class="fw-semibold mb-0">{{ formatHora(detalle()!.fecha_visita) }}</p>
              </div>

            </div>
          </div>
        </div>

        <!-- Formulario de estimación -->
        <div class="card border-0 shadow-sm mt-4">
          <div class="card-body p-4">
            <h5 class="fw-semibold mb-4">Documentación de la visita</h5>

            <div class="row g-3">

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Fecha de visita</label>
                <input
                  type="date"
                  class="form-control"
                  [(ngModel)]="fechaVisita"
                />
              </div>

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Hora de visita</label>
                <input
                  type="time"
                  class="form-control"
                  [(ngModel)]="horaVisita"
                />
              </div>

              <div class="col-12">
                <label class="form-label small fw-medium">Problemas observados</label>
                <textarea
                  class="form-control"
                  rows="4"
                  placeholder="Describa los problemas observados durante la visita…"
                  [(ngModel)]="descripcionProblema"
                ></textarea>
              </div>

              <div class="col-sm-6">
                <label class="form-label small fw-medium">Costo Estimado ($)</label>
                <div class="input-group">
                  <span class="input-group-text">$</span>
                  <input
                    type="number"
                    class="form-control"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    [(ngModel)]="costoEstimado"
                  />
                </div>
              </div>

              <div class="col-12">
                <label class="form-label small fw-medium">Notas internas</label>
                <textarea
                  class="form-control"
                  rows="3"
                  placeholder="Notas solo visibles para el estimador y administrador…"
                  [(ngModel)]="notasInternas"
                ></textarea>
              </div>

            </div>

            @if (errorGuardado()) {
              <div class="alert alert-danger mt-3 mb-0">{{ errorGuardado() }}</div>
            }
            @if (exitoMsg()) {
              <div class="alert alert-success mt-3 mb-0">{{ exitoMsg() }}</div>
            }

            <div class="mt-4">
              <button
                class="btn btn-primary px-4"
                (click)="guardarEstimacion()"
                [disabled]="guardando()"
              >
                {{ guardando() ? 'Guardando…' : 'Guardar estimación' }}
              </button>
            </div>

          </div>
        </div>

      }

    </div>
  `,
})
export class FileUnderEstimationComponent implements OnInit {
  private auth   = inject(AuthSupabaseService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  detalle  = signal<ExpedienteDetalle | null>(null);
  cargando = signal(true);
  errorMsg = signal<string>('');

  fechaVisita          = '';
  horaVisita           = '';
  descripcionProblema  = '';
  notasInternas        = '';
  costoEstimado: number | null = null;

  guardando     = signal(false);
  exitoMsg      = signal('');
  errorGuardado = signal('');

  private expedienteId = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    console.log('[FileUnderEstimation] id param:', id);

    if (!id) { this.cargando.set(false); return; }
    this.expedienteId = id;

    try {
      const { data: exp, error: expError } = await this.auth.client
        .from('expediente')
        .select('numero, fecha_visita, cliente_id, servicio_id')
        .eq('id', id)
        .maybeSingle();

      if (expError) throw new Error(`expediente: ${expError.message}`);
      if (!exp) throw new Error('Expediente no encontrado. Verifica RLS en la tabla expediente.');

      const [servicioRes, perfilRes, locRes, estimacionRes] = await Promise.all([
        this.auth.client.from('servicio').select('nombre_es').eq('id', exp.servicio_id).single(),
        this.auth.client.from('perfil').select('nombre, apellido, telefono').eq('id', exp.cliente_id).single(),
        this.auth.client.from('localizacion').select('direccion').eq('expediente_id', id).single(),
        this.auth.client
          .from('estimacion')
          .select('fecha_visita_real, descripcion_problema, costo_estimado, notas_internas')
          .eq('expediente_id', id)
          .maybeSingle(),
      ]);

      this.detalle.set({
        numero:           exp.numero,
        fecha_visita:     exp.fecha_visita,
        servicio_nombre:  servicioRes.data?.nombre_es ?? '—',
        cliente_nombre:   perfilRes.data
          ? `${perfilRes.data.nombre} ${perfilRes.data.apellido}`
          : '—',
        cliente_telefono: perfilRes.data?.telefono ?? '',
        direccion:        locRes.data?.direccion ?? '—',
      });

      // Pre-cargar datos de estimación existente
      const est = estimacionRes.data;
      if (est) {
        if (est.fecha_visita_real) {
          this.fechaVisita = est.fecha_visita_real.slice(0, 10);
          this.horaVisita  = est.fecha_visita_real.slice(11, 16);
        }
        this.descripcionProblema = est.descripcion_problema ?? '';
        this.costoEstimado       = est.costo_estimado       ?? null;
        this.notasInternas       = est.notas_internas       ?? '';
      }

    } catch (e: any) {
      console.error('[FileUnderEstimation]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async guardarEstimacion() {
    this.errorGuardado.set('');
    this.exitoMsg.set('');

    if (!this.fechaVisita || !this.horaVisita) {
      this.errorGuardado.set('La fecha y hora de visita son obligatorias.');
      return;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorGuardado.set('Los problemas observados son obligatorios.');
      return;
    }
    if (this.costoEstimado === null || this.costoEstimado < 0) {
      this.errorGuardado.set('El costo estimado es obligatorio y debe ser mayor o igual a 0.');
      return;
    }

    this.guardando.set(true);

    try {
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (!user) throw new Error('No hay sesión activa.');

      const fechaVisitaReal = `${this.fechaVisita}T${this.horaVisita}:00`;

      const { error } = await this.auth.client
        .from('estimacion')
        .upsert({
          expediente_id:        this.expedienteId,
          estimador_id:         user.id,
          fecha_visita_real:    fechaVisitaReal,
          descripcion_problema: this.descripcionProblema.trim(),
          costo_estimado:       this.costoEstimado,
          notas_internas:       this.notasInternas.trim() || null,
        }, { onConflict: 'expediente_id' });

      if (error) throw new Error(error.message);

      const { error: expError } = await this.auth.client
        .from('expediente')
        .update({ estado: 'estimado' })
        .eq('id', this.expedienteId);

      if (expError) throw new Error(expError.message);

      this.exitoMsg.set('Estimación guardada correctamente.');
    } catch (e: any) {
      console.error('[FileUnderEstimation] guardar:', e.message);
      this.errorGuardado.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleTimeString('es-CR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  volver() {
    this.router.navigate(['/estimator/files-under-estimation']);
  }

}
