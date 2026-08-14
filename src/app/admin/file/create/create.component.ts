import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { Servicio, PROVINCIAS_CANADA, SERVICIOS_FALLBACK } from '../../../models';
import { TipoInmueble } from '../../../types/supabase';

interface ClienteRow {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  // Dirección del PERFIL del cliente. Solo se lee: sirve de punto de partida
  // para la localización del inmueble y esta pantalla nunca la reescribe.
  direccion_unidad: string | null;
  direccion_calle: string | null;
  direccion_ciudad: string | null;
  direccion_provincia: string | null;
  direccion_codigo_postal: string | null;
}

@Component({
  selector: 'app-admin-file-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class AdminFileCreateComponent implements OnInit {
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

  /** El cliente elegido tiene dirección en su perfil → se puede recuperar. */
  clienteConDireccion = computed(() => {
    const c = this.clienteSeleccionado();
    return !!c && !!(c.direccion_calle || c.direccion_ciudad || c.direccion_codigo_postal || c.direccion_unidad);
  });

  /**
   * true mientras la localización coincide con la dirección del perfil. Se
   * calcula (no se memoriza) para que el aviso deje de decir «tomada del
   * perfil» en cuanto el administrador edita un campo.
   */
  direccionDesdeCliente = computed(() => {
    const c = this.clienteSeleccionado();
    if (!c || !this.clienteConDireccion()) return false;
    const lv = this.localizacionValue();
    return (lv.numero_unidad ?? '') === (c.direccion_unidad        ?? '')
        && (lv.calle         ?? '') === (c.direccion_calle         ?? '')
        && (lv.ciudad        ?? '') === (c.direccion_ciudad        ?? '')
        && (lv.provincia_ca  ?? '') === (c.direccion_provincia     || 'QC')
        && (lv.codigo_postal ?? '') === (c.direccion_codigo_postal ?? '');
  });

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
  readonly provinciasCanada = PROVINCIAS_CANADA;
  readonly CA_POSTAL_RE     = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

  readonly STEPS = [
    'admin_file_create.step2_name',
    'file_create.step1_name',
    'file_create.step3_name',
    'file_create.step4_name',
  ];

  /** Etiquetas + icono de cada fila del resumen lateral. Mismo orden que STEPS. */
  readonly RESUMEN_META = [
    { label: 'admin_file_create.step2_name', icon: 'bi-person'    },
    { label: 'file_create.step1_name',       icon: 'bi-tools'     },
    { label: 'file_create.step3_name',       icon: 'bi-calendar3' },
    { label: 'file_create.step4_name',       icon: 'bi-geo-alt'   },
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

  // Direcciones canadienses únicamente.
  localizacionForm = this.fb.group({
    tipo_inmueble: ['', Validators.required],
    numero_unidad: [''],
    calle:         ['', Validators.required],
    ciudad:        ['', Validators.required],
    provincia_ca:  ['QC', Validators.required],
    codigo_postal: ['', [Validators.required, Validators.pattern(this.CA_POSTAL_RE)]],
    latitud:       [null as number | null],
    longitud:      [null as number | null],
  });

  private expedienteStatus   = toSignal(this.expedienteForm.statusChanges,   { initialValue: this.expedienteForm.status });
  private localizacionStatus = toSignal(this.localizacionForm.statusChanges, { initialValue: this.localizacionForm.status });
  private expedienteValue    = toSignal(this.expedienteForm.valueChanges,    { initialValue: this.expedienteForm.value });
  private localizacionValue  = toSignal(this.localizacionForm.valueChanges,  { initialValue: this.localizacionForm.value });

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

  descripcionLen = computed(() => this.expedienteValue().descripcion?.length ?? 0);

  // ── Resumen lateral ────────────────────────────────────────────────────────
  // Sustituye al antiguo listado de pasos del sidebar: en lugar de repetir el
  // progreso por sexta vez, muestra el valor real elegido en cada paso.
  private resumenValores = computed<(string | null)[]>(() => {
    const cli = this.clienteSeleccionado();
    const srv = this.serviciosLocalizados().find(s => s.id === this.servicioId());
    const ev  = this.expedienteValue();
    const lv  = this.localizacionValue();

    const visita = ev.fecha_visita && ev.hora_visita
      ? `${ev.fecha_visita} · ${ev.hora_visita}`
      : null;

    const partes = [lv.calle, lv.ciudad, lv.provincia_ca];

    return [
      cli ? `${cli.nombre} ${cli.apellido}` : null,
      srv?.nombre_local ?? null,
      visita,
      partes.filter(Boolean).join(', ') || null,
    ];
  });

  resumen = computed(() =>
    this.RESUMEN_META.map((meta, i) => ({
      ...meta,
      value: this.resumenValores()[i],
      done:  this.stepDone(i),
    }))
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  stepDone(idx: number): boolean {
    return [this.step1Complete(), this.step2Complete(), this.step3Complete(), this.step4Complete()][idx] ?? false;
  }

  serviceIcon(codigo: string): string {
    const c = codigo.toLowerCase();
    if (c.includes('moho'))                          return 'bi-biohazard';
    if (c.includes('agua') || c.includes('dano'))    return 'bi-droplet';
    if (c.includes('desamian'))                      return 'bi-layers';
    if (c.includes('demolic'))                       return 'bi-buildings';
    if (c.includes('aisla'))                         return 'bi-layers';
    if (c.includes('fund') || c.includes('dren'))    return 'bi-water';
    if (c.includes('elect'))                         return 'bi-lightning-charge';
    if (c.includes('pint'))                          return 'bi-brush';
    if (c.includes('techo') || c.includes('teja'))   return 'bi-house';
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
    this.aplicarDireccionCliente();
  }

  limpiarCliente() {
    this.clienteId.set(null);
    this.busquedaCliente.set('');
    this.dropdownVisible.set(false);
    // La dirección ya copiada se queda: pertenece al inmueble, no al cliente.
  }

  // ── Dirección del inmueble a partir del perfil del cliente ─────────────────
  /**
   * Copia la dirección del perfil en los campos del inmueble. Es solo el punto
   * de partida — casi siempre el inmueble es el domicilio del cliente — y los
   * campos siguen siendo editables. Lo que se escriba aquí va únicamente a la
   * tabla `localizacion` del expediente: el perfil del cliente no se toca.
   *
   * Se sustituye el bloque entero (no campo a campo) para no mezclar la calle
   * de un cliente con la ciudad de otro al cambiar de cliente.
   */
  aplicarDireccionCliente(): void {
    const c = this.clienteSeleccionado();
    if (!c || !this.clienteConDireccion()) return;

    this.localizacionForm.patchValue({
      numero_unidad: c.direccion_unidad         ?? '',
      calle:         c.direccion_calle          ?? '',
      ciudad:        c.direccion_ciudad         ?? '',
      provincia_ca:  c.direccion_provincia      || 'QC',
      codigo_postal: c.direccion_codigo_postal  ?? '',
    });
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
    await Promise.all([this.cargarServicios(), this.cargarClientes()]);
  }

  private async cargarServicios() {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es, descripcion_fr, descripcion_en, descripcion_es')
      .eq('activo', true)
      .order('codigo');
    if (error) console.error('[AdminFileCreate] servicios:', error.message);
    this.servicios.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.cargandoServicios.set(false);
  }

  private async cargarClientes() {
    this.cargandoClientes.set(true);
    const { data, error } = await this.auth.client
      .from('perfil')
      .select('id, nombre, apellido, email, telefono, direccion_unidad, direccion_calle, direccion_ciudad, direccion_provincia, direccion_codigo_postal')
      .eq('rol', 'cliente')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) console.error('[AdminFileCreate] clientes:', error.message);
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

      const direccionFinal = lv.numero_unidad
        ? `${lv.numero_unidad}-${lv.calle}`
        : (lv.calle ?? '');

      await this.expedienteService.crear({
        clienteId:   this.clienteId()!,
        servicioId:  this.servicioId()!,
        numero:      this.generarNumeroExpediente(),
        fechaVisita: `${ev.fecha_visita}T${ev.hora_visita}`,
        descripcion: ev.descripcion || null,
        // `provincia` / `canton` / `distrito` son los nombres de columna de la
        // tabla localizacion; aquí transportan provincia, ciudad y código postal.
        localizacion: {
          tipo_inmueble: (lv.tipo_inmueble ?? 'otro') as TipoInmueble,
          direccion:  direccionFinal,
          provincia:  lv.provincia_ca  ?? '',
          canton:     lv.ciudad        ?? '',
          distrito:   lv.codigo_postal ?? '',
          referencia: null,
          latitud:    lv.latitud    ?? null,
          longitud:   lv.longitud   ?? null,
        },
      });

      this.router.navigate(['/admin/file']);
    } catch (e: any) {
      console.error('[AdminFileCreate] onSubmit:', e);
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
    this.router.navigate(['/admin/file']);
  }
}
