import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { Servicio, PROVINCIAS_CANADA, SERVICIOS_FALLBACK } from '../../../models';

/**
 * Dirección del PERFIL del cliente. Solo se lee: es el punto de partida de la
 * localización del inmueble y esta pantalla nunca la reescribe.
 */
interface PerfilDireccion {
  unidad:        string | null;
  calle:         string | null;
  ciudad:        string | null;
  provincia:     string | null;
  codigo_postal: string | null;
}

@Component({
  selector: 'app-file-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class FileCreateComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);
  private fb                = inject(FormBuilder);
  private translate         = inject(TranslateService);

  user = toSignal(this.auth.user$);

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  // ── Data signals ───────────────────────────────────────────────────────────
  servicios         = signal<Servicio[]>([]);

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
  cargandoServicios = signal(true);
  servicioId        = signal<number | null>(null);
  servicioRequerido = signal(false);
  enviando          = signal(false);
  error             = signal('');
  ubicacionCargando = signal(false);
  ubicacionError    = signal('');
  gpsVisible        = signal(false);

  // ── Static config ──────────────────────────────────────────────────────────
  readonly provinciasCanada = PROVINCIAS_CANADA;
  readonly CA_POSTAL_RE     = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

  readonly STEPS = [
    'file_create.step1_name',
    'file_create.step2_name',
    'file_create.step3_name',
    'file_create.step4_name',
  ];

  /** Filas del resumen en vivo del raíl, en el mismo orden que STEPS. */
  readonly RESUMEN_META = [
    { label: 'file_create.step1_name', icon: 'bi-tools'     },
    { label: 'file_create.step2_name', icon: 'bi-person'    },
    { label: 'file_create.step3_name', icon: 'bi-calendar3' },
    { label: 'file_create.step4_name', icon: 'bi-geo-alt'   },
  ];

  /** «¿Qué pasa después?» — línea de tiempo del proceso, en el raíl. */
  readonly PROCESO = [
    { num: '01', title: 'file_create.process1_title', text: 'file_create.process1_text' },
    { num: '02', title: 'file_create.process2_title', text: 'file_create.process2_text' },
    { num: '03', title: 'file_create.process3_title', text: 'file_create.process3_text' },
    { num: '04', title: 'file_create.process4_title', text: 'file_create.process4_text' },
  ];

  readonly tiposInmueble = [
    { value: 'casa',            label: 'file_create.type_casa',           icon: 'bi-house-door'  },
    { value: 'apartamento',     label: 'file_create.type_apartamento',    icon: 'bi-building'    },
    { value: 'edificio',        label: 'file_create.type_edificio',       icon: 'bi-buildings'   },
    { value: 'local_comercial', label: 'file_create.type_local_comercial',icon: 'bi-shop'        },
    { value: 'otro',            label: 'file_create.type_otro',           icon: 'bi-three-dots'  },
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
  private perfilValue        = toSignal(
    this.perfilForm.valueChanges,
    { initialValue: this.perfilForm.value },
  );
  private expedienteValue    = toSignal(
    this.expedienteForm.valueChanges,
    { initialValue: this.expedienteForm.value },
  );
  private localizacionValue  = toSignal(
    this.localizacionForm.valueChanges,
    { initialValue: this.localizacionForm.value },
  );

  // ── Dirección del inmueble a partir del perfil ─────────────────────────────
  perfilDireccion = signal<PerfilDireccion | null>(null);

  /** El perfil tiene dirección guardada → se puede recuperar. */
  perfilConDireccion = computed(() => {
    const d = this.perfilDireccion();
    return !!d && !!(d.calle || d.ciudad || d.codigo_postal || d.unidad);
  });

  /**
   * true mientras la localización coincide con la dirección del perfil. Se
   * calcula (no se memoriza) para que el aviso deje de decir «tomada de tu
   * perfil» en cuanto el cliente edita un campo.
   */
  direccionDesdePerfil = computed(() => {
    const d = this.perfilDireccion();
    if (!d || !this.perfilConDireccion()) return false;
    const lv = this.localizacionValue();
    return (lv.numero_unidad ?? '') === (d.unidad        ?? '')
        && (lv.calle         ?? '') === (d.calle         ?? '')
        && (lv.ciudad        ?? '') === (d.ciudad        ?? '')
        && (lv.provincia_ca  ?? '') === (d.provincia     || 'QC')
        && (lv.codigo_postal ?? '') === (d.codigo_postal ?? '');
  });

  /**
   * Copia la dirección del perfil en los campos del inmueble. Es solo el punto
   * de partida — casi siempre el inmueble es el domicilio del cliente — y los
   * campos siguen siendo editables. Lo que se escriba aquí va únicamente a la
   * tabla `localizacion` del expediente: el perfil no se toca al guardar.
   */
  aplicarDireccionPerfil(): void {
    const d = this.perfilDireccion();
    if (!d || !this.perfilConDireccion()) return;

    this.localizacionForm.patchValue({
      numero_unidad: d.unidad        ?? '',
      calle:         d.calle         ?? '',
      ciudad:        d.ciudad        ?? '',
      provincia_ca:  d.provincia     || 'QC',
      codigo_postal: d.codigo_postal ?? '',
    });
  }

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

  descripcionLen = computed(() => (this.descripcionValue() as string | null)?.length ?? 0);

  // ── Resumen en vivo del raíl ───────────────────────────────────────────────
  /** Valor legible de cada paso, o null si aún no hay nada que enseñar. */
  private resumenValores = computed<(string | null)[]>(() => {
    const sid  = this.servicioId();
    const serv = sid ? this.serviciosLocalizados().find(s => s.id === sid)?.nombre_local ?? null : null;

    const pv       = this.perfilValue();
    const contacto = [pv.nombre, pv.apellido].filter(Boolean).join(' ').trim() || null;

    const ev     = this.expedienteValue();
    const visita = ev.fecha_visita
      ? `${ev.fecha_visita}${ev.hora_visita ? ' · ' + ev.hora_visita : ''}`
      : null;

    const lv    = this.localizacionValue();
    const calle = (lv.numero_unidad ? `${lv.numero_unidad}-${lv.calle ?? ''}` : (lv.calle ?? '')).trim();
    // La provincia trae 'QC' por defecto: sin calle ni ciudad no es un resumen.
    const ubicacion = (calle || lv.ciudad)
      ? [calle, lv.ciudad, lv.provincia_ca].filter(Boolean).join(', ')
      : null;

    return [serv, contacto, visita, ubicacion];
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
    if (c.includes('moho'))                         return 'bi-biohazard';
    if (c.includes('agua') || c.includes('dano'))   return 'bi-droplet-half';
    if (c.includes('desamian'))                     return 'bi-layers';
    if (c.includes('demolic'))                      return 'bi-buildings';
    if (c.includes('aisla'))                        return 'bi-layers';
    if (c.includes('fund') || c.includes('dren'))   return 'bi-water';
    if (c.includes('elect'))                        return 'bi-lightning-charge-fill';
    if (c.includes('pint'))                         return 'bi-brush-fill';
    if (c.includes('techo') || c.includes('teja'))  return 'bi-house-fill';
    if (c.includes('piso')  || c.includes('cer'))   return 'bi-grid-3x3';
    if (c.includes('carpint') || c.includes('mad')) return 'bi-hammer';
    if (c.includes('alumin') || c.includes('vidri'))return 'bi-window';
    if (c.includes('jardin') || c.includes('plant'))return 'bi-tree';
    return 'bi-tools';
  }

  invalid(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

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
    await Promise.all([this.cargarServicios(), this.cargarPerfil()]);
  }

  private async cargarServicios() {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es, descripcion_fr, descripcion_en, descripcion_es')
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
      .select('nombre, apellido, telefono, direccion_unidad, direccion_calle, direccion_ciudad, direccion_provincia, direccion_codigo_postal')
      .eq('id', userId)
      .single();
    this.perfilForm.patchValue({
      nombre:   data?.nombre   ?? '',
      apellido: data?.apellido ?? '',
      telefono: data?.telefono ?? '',
      email:    this.user()?.email ?? '',
    });

    this.perfilDireccion.set({
      unidad:        data?.direccion_unidad        ?? null,
      calle:         data?.direccion_calle         ?? null,
      ciudad:        data?.direccion_ciudad        ?? null,
      provincia:     data?.direccion_provincia     ?? null,
      codigo_postal: data?.direccion_codigo_postal ?? null,
    });
    // El formulario está recién creado y vacío: rellenarlo aquí no pisa nada
    // que el cliente haya escrito. A partir de este punto manda lo que edite.
    this.aplicarDireccionPerfil();
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
      this.error.set('file_create.session_error');
      return;
    }

    this.enviando.set(true);
    this.error.set('');

    try {
      const pv = this.perfilForm.value;
      const ev = this.expedienteForm.value;
      const lv = this.localizacionForm.value;

      // Solo datos de contacto. La dirección NO se toca: la del paso 4 es la
      // del inmueble y se guarda únicamente en la `localizacion` del expediente.
      const { error: perfilError } = await this.auth.client
        .from('perfil')
        .update({ nombre: pv.nombre ?? undefined, apellido: pv.apellido ?? undefined, telefono: pv.telefono ?? undefined })
        .eq('id', userId);
      if (perfilError) throw new Error(`Error al actualizar perfil: ${perfilError.message}`);

      const direccionFinal = lv.numero_unidad
        ? `${lv.numero_unidad}-${lv.calle}`
        : (lv.calle ?? '');

      await this.expedienteService.crear({
        clienteId:   userId,
        servicioId:  this.servicioId()!,
        numero:      this.generarNumeroExpediente(),
        fechaVisita: `${ev.fecha_visita}T${ev.hora_visita}`,
        descripcion: ev.descripcion || null,
        // `provincia` / `canton` / `distrito` son los nombres de columna de la
        // tabla localizacion; aquí transportan provincia, ciudad y código postal.
        localizacion: {
          tipo_inmueble: (lv.tipo_inmueble ?? 'otro') as import('../../../types/supabase').TipoInmueble,
          direccion:  direccionFinal,
          provincia:  lv.provincia_ca  ?? '',
          canton:     lv.ciudad        ?? '',
          distrito:   lv.codigo_postal ?? '',
          referencia: null,
          latitud:    lv.latitud    ?? null,
          longitud:   lv.longitud   ?? null,
        },
      });

      this.router.navigate(['/client/file/my-files']);
    } catch (e: any) {
      console.error('[FileCreate] onSubmit error:', e);
      this.error.set('file_create.save_error');
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
