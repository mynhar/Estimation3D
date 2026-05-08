import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { Servicio, PROVINCIAS, SERVICIOS_FALLBACK } from '../../../models';

@Component({
  selector: 'app-file-create',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class FileCreateComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);
  private fb                = inject(FormBuilder);

  user = toSignal(this.auth.user$);

  // ── Data signals ───────────────────────────────────────────────────────────
  servicios         = signal<Servicio[]>([]);
  cargandoServicios = signal(true);
  servicioId        = signal<number | null>(null);
  servicioRequerido = signal(false);
  enviando          = signal(false);
  error             = signal('');
  ubicacionCargando = signal(false);
  ubicacionError    = signal('');
  gpsVisible        = signal(false);

  // ── Static config ──────────────────────────────────────────────────────────
  readonly provincias = PROVINCIAS;

  readonly STEPS = ['Servicio', 'Contacto', 'Visita', 'Ubicación'];

  readonly tiposInmueble = [
    { value: 'casa',            label: 'Casa',       icon: 'bi-house-door'  },
    { value: 'apartamento',     label: 'Apto.',      icon: 'bi-building'    },
    { value: 'edificio',        label: 'Edificio',   icon: 'bi-buildings'   },
    { value: 'local_comercial', label: 'Comercial',  icon: 'bi-shop'        },
    { value: 'otro',            label: 'Otro',       icon: 'bi-three-dots'  },
  ];

  // ── Forms ──────────────────────────────────────────────────────────────────
  perfilForm = this.fb.group({
    nombre:   ['', Validators.required],
    apellido: ['', Validators.required],
    telefono: ['', Validators.required],
    email:    [''],
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

  // Convertir el estado de validez de cada FormGroup a signals reactivos.
  // computed(() => this.form.valid) NO funciona: form.valid no es un signal,
  // por lo que computed lo calcula una sola vez y nunca se actualiza.
  private perfilStatus       = toSignal(this.perfilForm.statusChanges,       { initialValue: this.perfilForm.status });
  private expedienteStatus   = toSignal(this.expedienteForm.statusChanges,   { initialValue: this.expedienteForm.status });
  private localizacionStatus = toSignal(this.localizacionForm.statusChanges, { initialValue: this.localizacionForm.status });
  private descripcionValue   = toSignal(
    this.expedienteForm.get('descripcion')!.valueChanges,
    { initialValue: '' as string }
  );

  // ── Computed: per-step completion ──────────────────────────────────────────
  step1Complete = computed(() => !!this.servicioId());
  step2Complete = computed(() => this.perfilStatus()       === 'VALID');
  step3Complete = computed(() => this.expedienteStatus()   === 'VALID');
  step4Complete = computed(() => this.localizacionStatus() === 'VALID');

  allComplete = computed(() =>
    this.step1Complete() && this.step2Complete() && this.step3Complete() && this.step4Complete()
  );

  completedSteps = computed(() =>
    [this.step1Complete(), this.step2Complete(), this.step3Complete(), this.step4Complete()]
      .filter(Boolean).length
  );

  progressPct = computed(() => (this.completedSteps() / 4) * 100);

  descripcionLen = computed(() => (this.descripcionValue() as string | null)?.length ?? 0);

  // ── Helpers ────────────────────────────────────────────────────────────────
  stepDone(idx: number): boolean {
    return [this.step1Complete(), this.step2Complete(), this.step3Complete(), this.step4Complete()][idx] ?? false;
  }

  serviceIcon(nombre: string): string {
    const n = nombre.toLowerCase();
    if (n.includes('agua') || n.includes('plom'))    return 'bi-droplet-fill';
    if (n.includes('elect'))                          return 'bi-lightning-charge-fill';
    if (n.includes('pint'))                           return 'bi-brush-fill';
    if (n.includes('techo') || n.includes('teja'))   return 'bi-house-fill';
    if (n.includes('cer')  || n.includes('piso'))    return 'bi-grid-3x3';
    if (n.includes('carpint') || n.includes('mad'))  return 'bi-hammer';
    if (n.includes('alumin') || n.includes('vidri')) return 'bi-window';
    if (n.includes('jardin') || n.includes('plant')) return 'bi-tree';
    if (n.includes('moh'))                            return 'bi-biohazard';
    if (n.includes('agua') || n.includes('dano'))    return 'bi-droplet-half';
    if (n.includes('demol'))                          return 'bi-buildings';
    if (n.includes('aisla'))                          return 'bi-layers';
    if (n.includes('fund') || n.includes('dren'))    return 'bi-water';
    return 'bi-tools';
  }

  invalid(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  usarUbicacion() {
    if (!navigator.geolocation) {
      this.ubicacionError.set('Tu navegador no soporta geolocalización.');
      return;
    }
    this.ubicacionCargando.set(true);
    this.ubicacionError.set('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.localizacionForm.patchValue({
          latitud:  pos.coords.latitude,
          longitud: pos.coords.longitude,
        });
        this.ubicacionCargando.set(false);
      },
      (err) => {
        this.ubicacionError.set(
          err.code === 1
            ? 'Permiso de ubicación denegado. Actívalo en la configuración de tu navegador.'
            : 'No se pudo obtener tu ubicación. Intenta de nuevo.',
        );
        this.ubicacionCargando.set(false);
      },
      { timeout: 10_000 },
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
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

  // ── Actions ────────────────────────────────────────────────────────────────
  async onSubmit() {
    this.perfilForm.markAllAsTouched();
    this.expedienteForm.markAllAsTouched();
    this.localizacionForm.markAllAsTouched();
    this.servicioRequerido.set(!this.servicioId());

    if (!this.allComplete()) return;

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

      const { error: perfilError } = await this.auth.client
        .from('perfil')
        .update({ nombre: pv.nombre, apellido: pv.apellido, telefono: pv.telefono })
        .eq('id', userId);
      if (perfilError) throw new Error(`Error al actualizar perfil: ${perfilError.message}`);

      await this.expedienteService.crear({
        clienteId:   userId,
        servicioId:  this.servicioId()!,
        numero:      this.generarNumeroExpediente(),
        fechaVisita: `${ev.fecha_visita}T${ev.hora_visita}`,
        descripcion: ev.descripcion || null,
        localizacion: {
          tipo_inmueble: lv.tipo_inmueble ?? '',
          direccion:     lv.direccion     ?? '',
          provincia:     lv.provincia     ?? '',
          canton:        lv.canton        ?? '',
          distrito:      lv.distrito      ?? '',
          referencia:    lv.referencia    || null,
          latitud:       lv.latitud       ?? null,
          longitud:      lv.longitud      ?? null,
        },
      });

      this.router.navigate(['/client/file/my-files']);
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
    this.router.navigate(['/client/file/my-files']);
  }
}
