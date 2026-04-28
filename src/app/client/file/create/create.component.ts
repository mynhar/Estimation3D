import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';

interface Servicio {
  id: number;
  codigo: string;
  nombre_es: string;
  descripcion_es: string;
}

const PROVINCIAS = [
  'San José', 'Alajuela', 'Cartago', 'Heredia',
  'Guanacaste', 'Puntarenas', 'Limón',
];

const SERVICIOS_FALLBACK: Servicio[] = [
  { id: 1, codigo: 'descontaminacion_moho',      nombre_es: 'Descontaminación de moho',        descripcion_es: 'Confinamiento, presión negativa, HEPA, biocidas, test de aire final, certificación.' },
  { id: 2, codigo: 'desamiantado',               nombre_es: 'Desamiantado',                    descripcion_es: 'Plan CNESST, Ley R-20, manifiesto transporte, conservación 10 años.' },
  { id: 3, codigo: 'danos_agua',                 nombre_es: 'Daños por agua',                  descripcion_es: 'Categorías 1-2-3, extracción, secado LGR, certificación IICRC.' },
  { id: 4, codigo: 'demolicion_interior',        nombre_es: 'Demolición interior controlada',  descripcion_es: 'Verificación amianto/plomo, muros portantes, gestión escombros.' },
  { id: 5, codigo: 'aislamiento',                nombre_es: 'Aislamiento (retiro e instalación)', descripcion_es: 'Valor R, test amianto vermiculita, certificación ÉcoRénov.' },
  { id: 6, codigo: 'fundacion_dren_frances',     nombre_es: 'Fundación + dren francés',        descripcion_es: 'Inyección epoxi/poliuretano, Info-Excavation, garantía 10 años.' },
];

@Component({
  selector: 'app-file-create',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="container py-4" style="max-width: 860px">

      <div class="mb-4">
        <h4 class="fw-semibold mb-1">Crear nuevo expediente</h4>
        <p class="text-muted mb-0">Describa su situación y seleccione un servicio.</p>
      </div>

      @if (error()) {
        <div class="alert alert-danger">{{ error() }}</div>
      }

      <!-- ── 1. SERVICIO ─────────────────────────────── -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header fw-semibold bg-white border-bottom">
          Seleccionar un servicio
        </div>
        <div class="card-body">
          @if (cargandoServicios()) {
            <p class="text-muted small">Cargando servicios…</p>
          } @else {
            <div class="list-group">
              @for (s of servicios(); track s.id) {
                <label class="list-group-item list-group-item-action d-flex gap-3 py-3"
                       [class.active]="servicioId() === s.id"
                       style="cursor:pointer">
                  <input type="radio" class="form-check-input flex-shrink-0 mt-1"
                         [value]="s.id"
                         [checked]="servicioId() === s.id"
                         (change)="servicioId.set(s.id)" />
                  <div>
                    <strong>{{ s.codigo }} – {{ s.nombre_es }}</strong>
                    <p class="mb-0 small text-muted">{{ s.descripcion_es }}</p>
                  </div>
                </label>
              }
            </div>
            @if (servicioRequerido()) {
              <div class="text-danger small mt-2">Debe seleccionar un servicio.</div>
            }
          }
        </div>
      </div>

      <!-- ── 2. PERFIL ───────────────────────────────── -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header fw-semibold bg-white border-bottom">
          Datos de contacto
        </div>
        <div class="card-body">
          <form [formGroup]="perfilForm">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Nombre <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="nombre" />
                @if (invalid(perfilForm, 'nombre')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-6">
                <label class="form-label">Apellido <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="apellido" />
                @if (invalid(perfilForm, 'apellido')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-6">
                <label class="form-label">Teléfono <span class="text-danger">*</span></label>
                <input type="tel" class="form-control" formControlName="telefono" />
                @if (invalid(perfilForm, 'telefono')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-6">
                <label class="form-label">Correo <span class="text-danger">*</span></label>
                <input type="email" class="form-control" formControlName="email" />
                @if (invalid(perfilForm, 'email')) {
                  <div class="text-danger small">Correo inválido.</div>
                }
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- ── 3. EXPEDIENTE ──────────────────────────── -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header fw-semibold bg-white border-bottom">
          Detalles del expediente
        </div>
        <div class="card-body">
          <form [formGroup]="expedienteForm">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Fecha de visita deseada <span class="text-danger">*</span></label>
                <input type="date" class="form-control" formControlName="fecha_visita" />
                @if (invalid(expedienteForm, 'fecha_visita')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-6">
                <label class="form-label">Hora preferida <span class="text-danger">*</span></label>
                <input type="time" class="form-control" formControlName="hora_visita" />
                @if (invalid(expedienteForm, 'hora_visita')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-12">
                <label class="form-label">Descripción del problema</label>
                <textarea class="form-control" rows="4" formControlName="descripcion"
                  placeholder="Describa su situación con el mayor detalle posible…"></textarea>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- ── 4. LOCALIZACIÓN ────────────────────────── -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header fw-semibold bg-white border-bottom">
          Localización
        </div>
        <div class="card-body">
          <form [formGroup]="localizacionForm">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Tipo de inmueble <span class="text-danger">*</span></label>
                <select class="form-select" formControlName="tipo_inmueble">
                  <option value="">Seleccione…</option>
                  <option value="casa">Casa</option>
                  <option value="apartamento">Apartamento</option>
                  <option value="edificio">Edificio</option>
                  <option value="local_comercial">Local comercial</option>
                  <option value="otro">Otro</option>
                </select>
                @if (invalid(localizacionForm, 'tipo_inmueble')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-12">
                <label class="form-label">Dirección completa <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="direccion" />
                @if (invalid(localizacionForm, 'direccion')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-4">
                <label class="form-label">Provincia <span class="text-danger">*</span></label>
                <select class="form-select" formControlName="provincia">
                  <option value="">Seleccione…</option>
                  @for (p of provincias; track p) {
                    <option [value]="p">{{ p }}</option>
                  }
                </select>
                @if (invalid(localizacionForm, 'provincia')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-4">
                <label class="form-label">Cantón <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="canton" />
                @if (invalid(localizacionForm, 'canton')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-md-4">
                <label class="form-label">Distrito <span class="text-danger">*</span></label>
                <input type="text" class="form-control" formControlName="distrito" />
                @if (invalid(localizacionForm, 'distrito')) {
                  <div class="text-danger small">Requerido.</div>
                }
              </div>
              <div class="col-12">
                <label class="form-label">Otras señas</label>
                <input type="text" class="form-control" formControlName="referencia"
                  placeholder="Frente al parque, casa azul…" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Latitud</label>
                <input type="number" class="form-control" formControlName="latitud"
                  step="any" placeholder="9.9341" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Longitud</label>
                <input type="number" class="form-control" formControlName="longitud"
                  step="any" placeholder="-84.0877" />
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- ── BOTONES ────────────────────────────────── -->
      <div class="d-flex gap-3 justify-content-end">
        <button type="button" class="btn btn-outline-secondary px-4"
          (click)="onCancel()" [disabled]="enviando()">
          Cancelar
        </button>
        <button type="button" class="btn btn-primary px-4"
          (click)="onSubmit()" [disabled]="enviando()">
          {{ enviando() ? 'Enviando…' : 'Enviar Expediente' }}
        </button>
      </div>

    </div>
  `,
})
export class FileCreateComponent implements OnInit {
  private auth   = inject(AuthSupabaseService);
  private router = inject(Router);
  private fb     = inject(FormBuilder);

  user = toSignal(this.auth.user$);

  servicios          = signal<Servicio[]>([]);
  cargandoServicios  = signal(true);
  servicioId         = signal<number | null>(null);
  servicioRequerido  = signal(false);
  enviando           = signal(false);
  error              = signal('');
  provincias         = PROVINCIAS;

  perfilForm = this.fb.group({
    nombre:   ['', Validators.required],
    apellido: ['', Validators.required],
    telefono: ['', Validators.required],
    email:    ['', [Validators.required, Validators.email]],
  });

  expedienteForm = this.fb.group({
    fecha_visita: ['', Validators.required],
    hora_visita:  ['', Validators.required],
    descripcion:  [''],
  });

  localizacionForm = this.fb.group({
    tipo_inmueble: ['', Validators.required],
    direccion:     ['', Validators.required],
    provincia:     ['', Validators.required],
    canton:        ['', Validators.required],
    distrito:      ['', Validators.required],
    referencia:    [''],
    latitud:       [null as number | null],
    longitud:      [null as number | null],
  });

  async ngOnInit() {
    await Promise.all([this.cargarServicios(), this.cargarPerfil()]);
  }

  private async cargarServicios() {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_es, descripcion_es')
      .eq('activo', true)
      .order('codigo');

    if (error) console.error('servicio table error:', error.message);

    this.servicios.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.cargandoServicios.set(false);
  }

  private async cargarPerfil() {
    const userId = this.user()?.id;
    if (!userId) return;

    const { data } = await this.auth.client
      .from('perfil')
      .select('nombre, apellido, telefono')
      .eq('id', userId)
      .single();

    this.perfilForm.patchValue({
      nombre:   data?.nombre   ?? '',
      apellido: data?.apellido ?? '',
      telefono: data?.telefono ?? '',
      email:    this.user()?.email ?? '',
    });
  }

  invalid(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  async onSubmit() {
    this.perfilForm.markAllAsTouched();
    this.expedienteForm.markAllAsTouched();
    this.localizacionForm.markAllAsTouched();
    this.servicioRequerido.set(!this.servicioId());

    if (
      this.perfilForm.invalid ||
      this.expedienteForm.invalid ||
      this.localizacionForm.invalid ||
      !this.servicioId()
    ) return;

    // Paso 0 · Obtener ID del usuario
    const userId = this.user()?.id;
    if (!userId) {
      this.error.set('Sesión no encontrada. Por favor inicia sesión nuevamente.');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    try {
      const pv = this.perfilForm.value;
      const ev = this.expedienteForm.value;
      const lv = this.localizacionForm.value;

      // Paso 1 · Actualizar perfil
      const { error: perfilError } = await this.auth.client
        .from('perfil')
        .update({
          nombre:   pv.nombre,
          apellido: pv.apellido,
          telefono: pv.telefono,
        })
        .eq('id', userId);

      if (perfilError) throw new Error(`Error al actualizar perfil: ${perfilError.message}`);

      // Paso 2 · Insertar expediente y obtener su ID
      const fechaVisita = `${ev.fecha_visita}T${ev.hora_visita}`;
      const numero = this.generarNumeroExpediente();
      const { data: expData, error: expError } = await this.auth.client
        .from('expediente')
        .insert({
          numero,
          cliente_id:   userId,
          servicio_id:  this.servicioId(),
          estado:       'nuevo',
          fecha_visita: fechaVisita,
          descripcion:  ev.descripcion || null,
        })
        .select('id')
        .single();

      if (expError) throw new Error(`Error al crear expediente: ${expError.message}`);
      if (!expData?.id) throw new Error('No se recibió el ID del expediente creado.');

      // Paso 3 · Insertar localización con el ID del expediente
      const { error: locError } = await this.auth.client
        .from('localizacion')
        .insert({
          expediente_id: expData.id,
          tipo_inmueble: lv.tipo_inmueble,
          direccion:     lv.direccion,
          provincia:     lv.provincia,
          canton:        lv.canton,
          distrito:      lv.distrito,
          referencia:    lv.referencia || null,
          latitud:       lv.latitud    ?? null,
          longitud:      lv.longitud   ?? null,
        });

      if (locError) throw new Error(`Error al guardar localización: ${locError.message}`);

      this.router.navigate(['/client/dashboard']);
    } catch (e: any) {
      console.error('[FileCreate] onSubmit error:', e);
      this.error.set(e?.message ?? 'Error desconocido al guardar. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  private generarNumeroExpediente(): string {
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `EXP-${fecha}-${rand}`;
  }

  onCancel() {
    this.perfilForm.reset();
    this.expedienteForm.reset();
    this.localizacionForm.reset();
    this.servicioId.set(null);
    this.router.navigate(['/client/dashboard']);
  }
}
