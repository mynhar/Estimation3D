import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { ContratoRepository, ContratoClienteView } from '../../../data/contrato.repository';
import {
  Servicio, PROVINCIAS, PROVINCIAS_CANADA, SERVICIOS_FALLBACK,
} from '../../../models';
import { TipoInmueble } from '../../../types/supabase';
import { AdminFileEstimatorReportComponent } from '../estimator-report/estimator-report.component';
import { AdminFileBuilderBidsComponent } from '../builder-bids/builder-bids.component';

interface ClienteRow {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
}

// Avance del contrato — pasos y porcentajes (paridad con el panel del cliente)
const CONTRATO_PASOS = [
  { key: 'generado',     pct: 25,  icon: 'bi-file-earmark-text' },
  { key: 'firmado',      pct: 50,  icon: 'bi-pen'               },
  { key: 'en_ejecucion', pct: 75,  icon: 'bi-tools'             },
  { key: 'completado',   pct: 100, icon: 'bi-house-check'       },
] as const;

const CONTRATO_PCT: Record<string, number> = {
  generado: 25, firmado: 50, en_ejecucion: 75, completado: 100, cancelado: 0,
};

@Component({
  selector: 'app-admin-file-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormsModule, TranslatePipe, AdminFileEstimatorReportComponent, AdminFileBuilderBidsComponent],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminFileEditComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private expedienteService = inject(ExpedienteService);
  private contratoRepo      = inject(ContratoRepository);
  private router            = inject(Router);
  private route             = inject(ActivatedRoute);
  private fb                = inject(FormBuilder);
  private translate         = inject(TranslateService);

  /** Público: la plantilla lo pasa al componente del informe del estimador. */
  readonly id = this.route.snapshot.paramMap.get('id')!;

  /** Pestaña activa del panel izquierdo. */
  tabActiva = signal<'expediente' | 'informe' | 'ofertas'>('expediente');

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );

  // ── Estado de carga / cabecera ─────────────────────────────────────────────
  cargando       = signal(true);
  loadError      = signal('');
  numero         = signal('');
  estadoActual   = signal('');
  creadoEn       = signal<string | null>(null);
  estimadorActual = signal<string | null>(null);

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

  servicioNombre = computed(() => {
    const s = this.serviciosLocalizados().find(x => x.id === this.servicioId());
    return s?.nombre_local ?? '—';
  });

  // ── Estado del guardado por sección ────────────────────────────────────────
  guardandoExp    = signal(false);
  errorExp        = signal('');
  exitoExp        = signal(false);

  // ── Localización auxiliar ──────────────────────────────────────────────────
  ubicacionCargando = signal(false);
  ubicacionError    = signal('');
  gpsVisible        = signal(false);

  readonly provincias       = PROVINCIAS;
  readonly provinciasCanada = PROVINCIAS_CANADA;
  readonly CA_POSTAL_RE     = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
  private readonly CA_CODES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']);

  readonly tiposInmueble = [
    { value: 'casa',            label: 'file_create.type_casa',            icon: 'bi-house-door'  },
    { value: 'apartamento',     label: 'file_create.type_apartamento',     icon: 'bi-building'    },
    { value: 'edificio',        label: 'file_create.type_edificio',        icon: 'bi-buildings'   },
    { value: 'local_comercial', label: 'file_create.type_local_comercial', icon: 'bi-shop'        },
    { value: 'otro',            label: 'file_create.type_otro',            icon: 'bi-three-dots'  },
  ];

  // ── Pipeline (paridad visual con my-file) ──────────────────────────────────
  readonly ESTADO_PROGRESO: Record<string, number> = {
    nuevo: 15, en_estimacion: 30, estimado: 50, en_oferta: 65,
    adjudicado: 80, contratado: 100, cancelado: 0,
  };
  readonly PASOS: { key: string; tkey: string }[] = [
    { key: 'nuevo',         tkey: 'pipeline.received' },
    { key: 'en_estimacion', tkey: 'pipeline.review'   },
    { key: 'estimado',      tkey: 'state.estimado'    },
    { key: 'en_oferta',     tkey: 'pipeline.offers'   },
    { key: 'adjudicado',    tkey: 'pipeline.chosen'   },
    { key: 'contratado',    tkey: 'pipeline.signed'   },
  ];

  readonly ESTADO_CLASE: Record<string, string> = {
    nuevo:         'bg-primary-subtle text-primary',
    en_estimacion: 'bg-info-subtle text-info-emphasis',
    estimado:      'bg-success-subtle text-success',
    en_oferta:     'bg-warning-subtle text-warning-emphasis',
    adjudicado:    'bg-warning-subtle text-warning-emphasis',
    contratado:    'bg-success-subtle text-success',
    cancelado:     'bg-secondary-subtle text-secondary',
  };
  estadoClase(estado: string): string {
    return this.ESTADO_CLASE[estado] ?? 'bg-secondary-subtle text-secondary';
  }

  progreso(estado: string): number { return this.ESTADO_PROGRESO[estado] ?? 0; }

  pasoActivo(pasoKey: string, estadoActual: string): 'done' | 'active' | 'pending' {
    if (estadoActual === 'cancelado') return 'pending';
    const keys    = ['nuevo', 'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado'];
    const iActual = keys.indexOf(estadoActual);
    const iPaso   = keys.indexOf(pasoKey);
    if (iPaso < iActual)  return 'done';
    if (iPaso === iActual) return 'active';
    return 'pending';
  }

  expCancelado = computed(() => this.estadoActual() === 'cancelado');

  // ── Avance del contrato ────────────────────────────────────────────────────
  readonly CONTRATO_PASOS = CONTRATO_PASOS;

  contratoEstado    = computed(() => this.contrato()?.estado ?? '');
  contratoCancelado = computed(() => this.contratoEstado() === 'cancelado');
  contratoProgreso  = computed(() => CONTRATO_PCT[this.contratoEstado()] ?? 0);

  contratoPasoActivo(pasoKey: string): 'done' | 'active' | 'pending' {
    if (this.contratoCancelado()) return 'pending';
    const pct     = this.contratoProgreso();
    const pasoPct = CONTRATO_PCT[pasoKey] ?? 0;
    if (pct > pasoPct)               return 'done';
    if (pct === pasoPct && pct > 0)  return 'active';
    return 'pending';
  }

  // ── Formularios base ───────────────────────────────────────────────────────
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
    numero_civico: [''],
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

  private descripcionValue = toSignal(
    this.expedienteForm.get('descripcion')!.valueChanges,
    { initialValue: '' as string },
  );
  descripcionLen = computed(() => (this.descripcionValue() as string | null)?.length ?? 0);

  // ════════════════════════════════════════════════════════════════════════════
  //  SECCIÓN ESTIMADOR — trasladada a admin/file/estimator-report.
  //  Aquí solo queda el nombre para la cabecera y los eventos del hijo.
  // ════════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════════
  //  SECCIÓN CONSTRUCTOR (ofertas) — trasladada a admin/file/builder-bids.
  //  Aquí solo quedan los eventos del hijo (estado + recarga del contrato).
  // ════════════════════════════════════════════════════════════════════════════

  /** El hijo adjudicó una oferta: el contrato del sidebar debe reflejarlo. */
  async onOfertaAdjudicada() {
    await this.cargarContrato();
  }

  // ── Contrato (solo lectura) ────────────────────────────────────────────────
  contrato = signal<ContratoClienteView | null>(null);

  // ── Utilidades ─────────────────────────────────────────────────────────────
  invalid(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
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

  iniciales(nombre: string | null | undefined, apellido: string | null | undefined): string {
    const a = (nombre ?? '').trim()[0] ?? '';
    const b = (apellido ?? '').trim()[0] ?? '';
    return (a + b).toUpperCase() || '?';
  }

  formatCosto(valor: number | null): string {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
  }

  // ── Selector de cliente ────────────────────────────────────────────────────
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
  cerrarDropdown() {
    setTimeout(() => this.dropdownVisible.set(false), 160);
  }

  // ── País / validadores ─────────────────────────────────────────────────────
  setPais(pais: string) {
    this.localizacionForm.get('pais')?.setValue(pais);
    this.actualizarValidadoresPais(pais);
  }

  private actualizarValidadoresPais(pais: string) {
    const crFields = ['direccion', 'provincia', 'canton', 'distrito'];
    const caFields = ['numero_civico', 'calle', 'ciudad', 'provincia_ca', 'codigo_postal'];

    if (pais === 'canada') {
      crFields.forEach(f => this.localizacionForm.get(f)?.clearValidators());
      this.localizacionForm.get('numero_civico')?.setValidators([Validators.required]);
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

  private parseDireccionCanada(dir: string): { unit: string; civic: string; street: string } {
    const withUnit = /^(\S+)-(\d+)\s+(.+)$/.exec(dir.trim());
    if (withUnit) return { unit: withUnit[1], civic: withUnit[2], street: withUnit[3] };
    const noUnit = /^(\d+)\s+(.+)$/.exec(dir.trim());
    if (noUnit) return { unit: '', civic: noUnit[1], street: noUnit[2] };
    return { unit: '', civic: '', street: dir };
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
        this.ubicacionError.set(err.code === 1 ? 'file_create.geo_denied' : 'file_create.geo_error');
        this.ubicacionCargando.set(false);
      },
      { timeout: 10_000 },
    );
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  async ngOnInit() {
    this.actualizarValidadoresPais('canada');
    await Promise.all([
      this.cargarServicios(),
      this.cargarClientes(),
    ]);
    await Promise.all([
      this.cargarExpediente(),
      this.cargarContrato(),
    ]);
    this.cargando.set(false);
  }

  private async cargarServicios() {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es, descripcion_fr, descripcion_en, descripcion_es')
      .eq('activo', true)
      .order('codigo');
    if (error) console.error('[AdminFileEdit] servicios:', error.message);
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
    if (error) console.error('[AdminFileEdit] clientes:', error.message);
    this.clientes.set((data ?? []) as ClienteRow[]);
    this.cargandoClientes.set(false);
  }

  private async cargarExpediente() {
    try {
      const [datos, detalle] = await Promise.all([
        this.expedienteService.getExpedienteParaEdicion(this.id),
        this.expedienteService.getDetalle(this.id),
      ]);

      this.numero.set(datos.numero);
      this.estadoActual.set(datos.estado);
      this.servicioId.set(datos.servicio_id);
      this.estimadorActual.set(
        detalle.estimador_id && detalle.estimador_nombre !== '—' ? detalle.estimador_nombre : null
      );

      // Pre-llenar cliente
      this.clienteId.set(datos.cliente_id);
      const c = this.clientes().find(x => x.id === datos.cliente_id);
      if (c) this.busquedaCliente.set(`${c.nombre} ${c.apellido}`);

      // Pre-llenar fecha/hora de la visita programada
      const [fecha, horaRaw] = (datos.fecha_visita ?? '').split('T');
      const hora = (horaRaw ?? '').substring(0, 5);
      this.expedienteForm.patchValue({
        fecha_visita: fecha ?? '',
        hora_visita:  hora  ?? '',
        descripcion:  datos.descripcion ?? '',
      });

      // País
      const esCanada = this.CA_CODES.has((datos.provincia ?? '').toUpperCase());
      const pais = esCanada ? 'canada' : 'costa_rica';
      this.actualizarValidadoresPais(pais);

      if (esCanada) {
        const { unit, civic, street } = this.parseDireccionCanada(datos.direccion);
        this.localizacionForm.patchValue({
          tipo_inmueble: datos.tipo_inmueble,
          pais:          'canada',
          numero_unidad: unit,
          numero_civico: civic,
          calle:         street,
          ciudad:        datos.canton,
          provincia_ca:  datos.provincia,
          codigo_postal: datos.distrito,
          referencia:    datos.referencia ?? '',
          latitud:       datos.latitud,
          longitud:      datos.longitud,
        });
      } else {
        this.localizacionForm.patchValue({
          tipo_inmueble: datos.tipo_inmueble,
          pais:          'costa_rica',
          direccion:     datos.direccion,
          provincia:     datos.provincia,
          canton:        datos.canton,
          distrito:      datos.distrito,
          referencia:    datos.referencia ?? '',
          latitud:       datos.latitud,
          longitud:      datos.longitud,
        });
      }
    } catch (e: any) {
      this.loadError.set('admin_file_edit.load_error');
      console.error('[AdminFileEdit] cargarExpediente:', e);
    }
  }

  private async cargarContrato() {
    try {
      this.contrato.set(await this.contratoRepo.findForClientByExpedienteId(this.id));
    } catch { /* contrato opcional */ }
  }

  // ── Guardar: EXPEDIENTE ────────────────────────────────────────────────────
  async guardarExpediente() {
    this.expedienteForm.markAllAsTouched();
    this.localizacionForm.markAllAsTouched();
    this.clienteRequerido.set(!this.clienteId());
    this.servicioRequerido.set(!this.servicioId());
    this.exitoExp.set(false);
    this.errorExp.set('');

    if (
      this.expedienteForm.invalid || this.localizacionForm.invalid ||
      !this.clienteId() || !this.servicioId()
    ) {
      this.errorExp.set('admin_file_edit.form_incomplete');
      return;
    }

    this.guardandoExp.set(true);
    try {
      const ev = this.expedienteForm.value;
      const lv = this.localizacionForm.value;
      const esCanada = lv.pais === 'canada';

      const streetPart     = `${lv.numero_civico ?? ''} ${lv.calle ?? ''}`.trim();
      const direccionFinal = esCanada
        ? (lv.numero_unidad?.trim() ? `${lv.numero_unidad.trim()}-${streetPart}` : streetPart)
        : (lv.direccion ?? '');

      await this.expedienteService.actualizarExpediente(this.id, {
        clienteId:   this.clienteId()!,
        servicioId:  this.servicioId()!,
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
      this.exitoExp.set(true);
    } catch (e: any) {
      console.error('[AdminFileEdit] guardarExpediente:', e);
      this.errorExp.set('admin_file_edit.save_error');
    } finally {
      this.guardandoExp.set(false);
    }
  }

  // ── Informe del estimador (componente hijo) ────────────────────────────────
  onEstadoDesdeInforme(estado: string) {
    this.estadoActual.set(estado);
  }
  onEstimadorAsignado(nombre: string) {
    this.estimadorActual.set(nombre);
  }

  volver() { this.router.navigate(['/admin/file']); }
}
