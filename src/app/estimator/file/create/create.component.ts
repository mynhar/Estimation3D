import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { Servicio, PROVINCIAS, PROVINCIAS_CANADA, SERVICIOS_FALLBACK } from '../../../models';
import { TipoInmueble } from '../../../types/supabase';

interface ClienteRow {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
}

@Component({
  selector: 'app-estimator-file-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class EstimatorFileCreateComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);
  private fb                = inject(FormBuilder);
  private translate         = inject(TranslateService);

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  // ── Clientes ───────────────────────────────────────────────────────────────
  clientes         = signal<ClienteRow[]>([]);
  cargandoClientes = signal(true);
  clienteId        = signal<string | null>(null);
  clienteRequerido = signal(false);
  busquedaCliente  = signal('');
  dropdownVisible  = signal(false);

  clienteSeleccionado = computed(() =>
    this.clientes().find(c => c.id === this.clienteId()) ?? null
  );

  clientesFiltrados = computed(() => {
    const q = this.busquedaCliente().toLowerCase().trim();
    const lista = this.clientes();
    if (!q) return lista.slice(0, 8);
    return lista
      .filter(c => `${c.nombre} ${c.apellido} ${c.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  });

  // ── Servicios ──────────────────────────────────────────────────────────────
  servicios         = signal<Servicio[]>([]);
  cargandoServicios = signal(true);
  servicioId        = signal<number | null>(null);
  servicioRequerido = signal(false);

  serviciosLocalizados = computed(() => {
    const lang = this.currentLang();
    return this.servicios().map(s => ({
      ...s,
      nombre_local:
        lang === 'en' ? (s.nombre_en || s.nombre_fr || s.nombre_es)
      : lang === 'es' ? (s.nombre_es || s.nombre_fr)
      :                 (s.nombre_fr || s.nombre_es),
      descripcion_local:
        lang === 'en' ? (s.descripcion_en || s.descripcion_fr || s.descripcion_es || '')
      : lang === 'es' ? (s.descripcion_es || s.descripcion_fr || '')
      :                 (s.descripcion_fr || s.descripcion_es || ''),
    }));
  });

  // ── Estado general ─────────────────────────────────────────────────────────
  enviando          = signal(false);
  error             = signal('');
  ubicacionCargando = signal(false);
  ubicacionError    = signal('');
  gpsVisible        = signal(false);

  // ── Static config ──────────────────────────────────────────────────────────
  readonly provincias       = PROVINCIAS;
  readonly provinciasCanada = PROVINCIAS_CANADA;
  readonly CA_POSTAL_RE     = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

  readonly STEPS = [
    'admin_file_create.step2_name',
    'file_create.step1_name',
    'file_create.step3_name',
    'file_create.step4_name',
  ];

  readonly tiposInmueble = [
    { value: 'casa',            label: 'file_create.type_casa',            icon: 'bi-house-door'  },
    { value: 'apartamento',     label: 'file_create.type_apartamento',     icon: 'bi-building'    },
    { value: 'edificio',        label: 'file_create.type_edificio',        icon: 'bi-buildings'   },
    { value: 'local_comercial', label: 'file_create.type_local_comercial', icon: 'bi-shop'        },
    { value: 'otro',            label: 'file_create.type_otro',            icon: 'bi-three-dots'  },
  ];

  // ── Forms ──────────────────────────────────────────────────────────────────
  expedienteForm = this.fb.group({
    fecha_visita: ['', Validators.required],
    hora_visita:  ['', Validators.required],
    descripcion:  [''],
  });

  localizacionForm = this.fb.group({
    tipo_inmueble: ['', Validators.required],
    pais:          ['canada'],
    direccion:     ['', Validators.required],
    provincia:     ['', Validators.required],
    canton:        ['', Validators.required],
    distrito:      ['', Validators.required],
    numero_unidad: [''],
    calle:         [''],
    ciudad:        [''],
    provincia_ca:  ['QC'],
    codigo_postal: [''],
    referencia:    [''],
    latitud:       [null as number | null],
    longitud:      [null as number | null],
  });

  private paisValue = toSignal(
    this.localizacionForm.get('pais')!.valueChanges,
    { initialValue: 'canada' as string },
  );
  paisActual = computed(() => this.paisValue() ?? 'canada');

  private expedienteStatus   = toSignal(this.expedienteForm.statusChanges,   { initialValue: this.expedienteForm.status });
  private localizacionStatus = toSignal(this.localizacionForm.statusChanges, { initialValue: this.localizacionForm.status });
  private descripcionValue   = toSignal(
    this.expedienteForm.get('descripcion')!.valueChanges,
    { initialValue: '' as string },
  );

  // ── Computed: per-step completion ──────────────────────────────────────────
  step1Complete = computed(() => !!this.clienteId());
  step2Complete = computed(() => !!this.servicioId());
  step3Complete = computed(() => this.expedienteStatus()   === 'VALID');
  step4Complete = computed(() => this.localizacionStatus() === 'VALID');

  allComplete = computed(() =>
    this.step1Complete() && this.step2Complete() && this.step3Complete() && this.step4Complete()
  );

  completedSteps = computed(() =>
    [this.step1Complete(), this.step2Complete(), this.step3Complete(), this.step4Complete()]
      .filter(Boolean).length
  );

  progressPct    = computed(() => (this.completedSteps() / 4) * 100);
  descripcionLen = computed(() => (this.descripcionValue() as string | null)?.length ?? 0);

  // ── Helpers ────────────────────────────────────────────────────────────────
  stepDone(idx: number): boolean {
    return [this.step1Complete(), this.step2Complete(), this.step3Complete(), this.step4Complete()][idx] ?? false;
  }

  serviceIcon(codigo: string): string {
    const c = codigo.toLowerCase();
    if (c.includes('moho'))                          return 'bi-biohazard';
    if (c.includes('agua') || c.includes('dano'))    return 'bi-droplet-half';
    if (c.includes('desamian'))                      return 'bi-layers';
    if (c.includes('demolic'))                       return 'bi-buildings';
    if (c.includes('aisla'))                         return 'bi-layers';
    if (c.includes('fund') || c.includes('dren'))    return 'bi-water';
    if (c.includes('elect'))                         return 'bi-lightning-charge-fill';
    if (c.includes('pint'))                          return 'bi-brush-fill';
    if (c.includes('techo') || c.includes('teja'))   return 'bi-house-fill';
    if (c.includes('piso')  || c.includes('cer'))    return 'bi-grid-3x3';
    if (c.includes('carpint') || c.includes('mad'))  return 'bi-hammer';
    if (c.includes('alumin') || c.includes('vidri')) return 'bi-window';
    if (c.includes('jardin') || c.includes('plant')) return 'bi-tree';
    return 'bi-tools';
  }

  invalid(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  // ── Client selector ────────────────────────────────────────────────────────
  setBusquedaCliente(e: Event) {
    this.busquedaCliente.set((e.target as HTMLInputElement).value);
    this.clienteId.set(null);
    this.dropdownVisible.set(true);
  }

  seleccionarCliente(c: ClienteRow) {
    this.clienteId.set(c.id);
    this.busquedaCliente.set(`${c.nombre} ${c.apellido}`);
    this.dropdownVisible.set(false);
    this.clienteRequerido.set(false);
  }

  limpiarCliente() {
    this.clienteId.set(null);
    this.busquedaCliente.set('');
    this.dropdownVisible.set(false);
  }

  /** Iniciales seguras: evita NaN.toUpperCase() cuando nombre/apellido vienen vacíos. */
  iniciales(nombre: string | null | undefined, apellido: string | null | undefined): string {
    const a = (nombre ?? '').trim()[0] ?? '';
    const b = (apellido ?? '').trim()[0] ?? '';
    return (a + b).toUpperCase() || '?';
  }

  cerrarDropdown() {
    setTimeout(() => this.dropdownVisible.set(false), 160);
  }

  // ── Country / validators ───────────────────────────────────────────────────
  setPais(pais: string) {
    this.localizacionForm.get('pais')?.setValue(pais);
    this.actualizarValidadoresPais(pais);
  }

  private actualizarValidadoresPais(pais: string) {
    const crFields = ['direccion', 'provincia', 'canton', 'distrito'];
    const caFields = ['calle', 'ciudad', 'provincia_ca', 'codigo_postal'];

    if (pais === 'canada') {
      crFields.forEach(f => this.localizacionForm.get(f)?.clearValidators());
      this.localizacionForm.get('calle')?.setValidators([Validators.required]);
      this.localizacionForm.get('ciudad')?.setValidators([Validators.required]);
      this.localizacionForm.get('provincia_ca')?.setValidators([Validators.required]);
      this.localizacionForm.get('codigo_postal')?.setValidators([
        Validators.required,
        Validators.pattern(this.CA_POSTAL_RE),
      ]);
    } else {
      caFields.forEach(f => this.localizacionForm.get(f)?.clearValidators());
      this.localizacionForm.get('direccion')?.setValidators([Validators.required]);
      this.localizacionForm.get('provincia')?.setValidators([Validators.required]);
      this.localizacionForm.get('canton')?.setValidators([Validators.required]);
      this.localizacionForm.get('distrito')?.setValidators([Validators.required]);
    }

    [...crFields, ...caFields].forEach(f =>
      this.localizacionForm.get(f)?.updateValueAndValidity({ emitEvent: false })
    );
    this.localizacionForm.updateValueAndValidity();
  }

  // ── GPS ────────────────────────────────────────────────────────────────────
  usarUbicacion() {
    if (!navigator.geolocation) {
      this.ubicacionError.set('file_create.geo_not_supported');
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
          err.code === 1 ? 'file_create.geo_denied' : 'file_create.geo_error',
        );
        this.ubicacionCargando.set(false);
      },
      { timeout: 10_000 },
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.actualizarValidadoresPais('canada');
    await Promise.all([this.cargarServicios(), this.cargarClientes()]);
  }

  private async cargarServicios() {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es, descripcion_fr, descripcion_en, descripcion_es')
      .eq('activo', true)
      .order('codigo');
    if (error) console.error('[EstimatorFileCreate] servicios:', error.message);
    this.servicios.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.cargandoServicios.set(false);
  }

  private async cargarClientes() {
    this.cargandoClientes.set(true);
    const { data, error } = await this.auth.client
      .from('perfil')
      .select('id, nombre, apellido, email, telefono')
      .eq('rol', 'cliente')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) console.error('[EstimatorFileCreate] clientes:', error.message);
    this.clientes.set((data ?? []) as ClienteRow[]);
    this.cargandoClientes.set(false);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async onSubmit() {
    this.expedienteForm.markAllAsTouched();
    this.localizacionForm.markAllAsTouched();
    this.clienteRequerido.set(!this.clienteId());
    this.servicioRequerido.set(!this.servicioId());

    if (!this.allComplete()) return;

    this.enviando.set(true);
    this.error.set('');

    try {
      const ev = this.expedienteForm.value;
      const lv = this.localizacionForm.value;
      const esCanada = lv.pais === 'canada';

      const direccionFinal = esCanada
        ? (lv.numero_unidad ? `${lv.numero_unidad}-${lv.calle}` : (lv.calle ?? ''))
        : (lv.direccion ?? '');

      await this.expedienteService.crear({
        clienteId:   this.clienteId()!,
        servicioId:  this.servicioId()!,
        numero:      this.generarNumeroExpediente(),
        fechaVisita: `${ev.fecha_visita}T${ev.hora_visita}`,
        descripcion: ev.descripcion || null,
        localizacion: {
          tipo_inmueble: (lv.tipo_inmueble ?? 'otro') as TipoInmueble,
          direccion:  direccionFinal,
          provincia:  esCanada ? (lv.provincia_ca  ?? '') : (lv.provincia ?? ''),
          canton:     esCanada ? (lv.ciudad        ?? '') : (lv.canton    ?? ''),
          distrito:   esCanada ? (lv.codigo_postal ?? '') : (lv.distrito  ?? ''),
          referencia: lv.referencia || null,
          latitud:    lv.latitud    ?? null,
          longitud:   lv.longitud   ?? null,
        },
      });

      this.router.navigate(['/estimator/files-to-be-estimated']);
    } catch (e: any) {
      console.error('[EstimatorFileCreate] onSubmit:', e);
      this.error.set('admin_file_create.save_error');
    } finally {
      this.enviando.set(false);
    }
  }

  private generarNumeroExpediente(): string {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand  = Math.floor(1000 + Math.random() * 9000);
    return `EXP-${fecha}-${rand}`;
  }

  onCancel() {
    this.router.navigate(['/estimator/files-to-be-estimated']);
  }
}
