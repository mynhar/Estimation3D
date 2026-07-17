import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { EstimacionService } from '../../../services/estimacion.service';
import { OfertaService } from '../../../services/oferta.service';
import { ContratoService } from '../../../services/contrato.service';
import { ArchivoService, TipoArchivo } from '../../../services/archivo.service';
import { ContratoRepository, ContratoClienteView } from '../../../data/contrato.repository';
import { PerfilRepository, PerfilNombre } from '../../../data/perfil.repository';
import {
  Servicio, PROVINCIAS, PROVINCIAS_CANADA, SERVICIOS_FALLBACK,
  OfertaForm, OfertaConConstructor, ArchivoRow, ESTADO_BADGE_OFERTA,
} from '../../../models';
import { TipoInmueble } from '../../../types/supabase';
import { FILE_LIMITS, validateFile } from '../../../shared/validators/file.validator';
import { matterportThumb } from '../../../shared/util/matterport';

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
  imports: [ReactiveFormsModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminFileEditComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private sanitizer         = inject(DomSanitizer);
  private expedienteService = inject(ExpedienteService);
  private estimacionService = inject(EstimacionService);
  private archivoService    = inject(ArchivoService);
  private ofertaService     = inject(OfertaService);
  private contratoService   = inject(ContratoService);
  private contratoRepo      = inject(ContratoRepository);
  private perfilRepo        = inject(PerfilRepository);
  private router            = inject(Router);
  private route             = inject(ActivatedRoute);
  private fb                = inject(FormBuilder);
  private translate         = inject(TranslateService);

  private readonly id = this.route.snapshot.paramMap.get('id')!;

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
  //  SECCIÓN ESTIMADOR
  // ════════════════════════════════════════════════════════════════════════════
  estimadores             = signal<PerfilNombre[]>([]);
  estimadorSeleccionadoId = signal<string>('');

  fechaVisitaReal     = '';
  horaVisitaReal      = '';
  descripcionProblema = '';
  notasInternas       = '';
  costoMin: number | null = null;
  costoMax: number | null = null;
  urlsTour            = signal<string[]>([]);

  guardandoEst  = signal(false);
  errorEst      = signal('');
  exitoEst      = signal(false);
  hasEstimacion = signal(false);

  // ── Archivos del estimador (fotos / documentos) ────────────────────────────
  private user = toSignal(this.auth.user$);
  fotos             = signal<ArchivoRow[]>([]);
  documentos        = signal<ArchivoRow[]>([]);
  subiendoFoto      = signal(false);
  subiendoDoc       = signal(false);
  errorFotos        = signal('');
  errorDocs         = signal('');
  eliminandoArchivo = signal<string | null>(null);
  fotoAmpliada      = signal<string | null>(null);

  // ── Tours virtuales 3D ─────────────────────────────────────────────────────
  nuevoTourUrl  = '';
  guardandoTour = signal(false);
  errorTour     = signal('');

  get costoValido(): boolean {
    if (this.costoMin === null && this.costoMax === null) return true;
    if (this.costoMin === null || this.costoMax === null) return false;
    return this.costoMin >= 0 && this.costoMax >= this.costoMin;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SECCIÓN CONSTRUCTOR (ofertas)
  // ════════════════════════════════════════════════════════════════════════════
  ofertas    = signal<OfertaConConstructor[]>([]);
  ofertaId   = signal<string | null>(null);
  private constructorId = '';

  precio: number | null       = null;
  plazoMin: number | null     = null;
  plazoMax: number | null     = null;
  garantiaAnos: number | null = null;
  fechaInicio                 = '';
  descripcionOferta           = '';

  guardandoOf = signal(false);
  errorOf     = signal('');
  exitoOf     = signal(false);

  ofertaSeleccionada = computed(() =>
    this.ofertas().find(o => o.id === this.ofertaId()) ?? null
  );

  get ofertaFormValido(): boolean {
    return !!(
      this.ofertaId() &&
      this.precio && this.precio > 0 &&
      this.plazoMin && this.plazoMin > 0 &&
      this.plazoMax && this.plazoMax >= (this.plazoMin ?? 0) &&
      this.fechaInicio &&
      this.descripcionOferta.trim()
    );
  }

  get puedeEditarOferta(): boolean {
    return this.estadoActual() !== 'contratado';
  }

  // ── Adjudicación de la oferta (paridad con client/builder-offer) ───────────
  adjudicando = signal(false);
  errorAdj    = signal('');
  exitoAdj    = signal('');
  videoOfertaActiva = signal<{ ofertaId: string; url: string } | null>(null);

  // El RPC aceptar_oferta sólo admite estos estados; fuera de ellos lanza
  // excepción, así que el botón se bloquea antes de llegar a la BD.
  private readonly ESTADOS_ADJUDICABLES = ['en_oferta', 'adjudicado'];

  yaContratado = computed(() => {
    const e = this.estadoActual();
    return e === 'adjudicado' || e === 'contratado';
  });

  puedeAdjudicar = computed(() => {
    if (!this.ofertaId() || this.adjudicando())                        return false;
    if (!this.ESTADOS_ADJUDICABLES.includes(this.estadoActual()))      return false;
    // Ya adjudicado: sólo tiene sentido cambiar a una oferta distinta.
    if (this.estadoActual() === 'adjudicado') {
      return this.ofertaSeleccionada()?.estado !== 'aceptada';
    }
    return true;
  });

  esSeleccionada(ofertaId: string): boolean { return this.ofertaId() === ofertaId; }

  ofertaBadgeClass(estado: string): string {
    return ESTADO_BADGE_OFERTA[estado] ?? 'bg-secondary-subtle text-secondary';
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    const w = this.translate.instant('offer.weeks');
    if (min === max) return `${min} ${w}`;
    return `${min ?? '?'} – ${max ?? '?'} ${w}`;
  }

  toggleVideoOferta(ofertaId: string, archivo: ArchivoRow) {
    const url    = this.publicUrl(archivo.url_storage);
    const actual = this.videoOfertaActiva();
    if (actual?.ofertaId === ofertaId && actual.url === url) this.videoOfertaActiva.set(null);
    else                                                     this.videoOfertaActiva.set({ ofertaId, url });
  }

  videoOfertaUrl(ofertaId: string): string | null {
    const a = this.videoOfertaActiva();
    return a?.ofertaId === ofertaId ? a.url : null;
  }

  /**
   * Adjudica la oferta seleccionada: RPC (expediente → adjudicado, resto de
   * ofertas → rechazadas, contrato nuevo), regenera el PDF y sustituye el
   * anterior. Los datos del PDF se releen de la BD para que reflejen lo
   * persistido y no ediciones del formulario sin guardar.
   */
  async adjudicarOferta() {
    const ofertaId = this.ofertaId();
    const oferta   = this.ofertaSeleccionada();
    if (!ofertaId || !oferta || !this.puedeAdjudicar()) return;

    this.adjudicando.set(true);
    this.errorAdj.set('');
    this.exitoAdj.set('');
    try {
      // 1 — Ruta del PDF anterior antes de que el RPC borre el contrato.
      const contratoAnterior = await this.contratoService.buscarPorExpediente(this.id);
      const urlPdfAnterior   = contratoAnterior?.url_pdf ?? null;

      // 2 — Adjudicación en BD.
      await this.ofertaService.aceptarOferta(this.id, ofertaId);

      // 3 — Borrar el PDF anterior (best-effort: no interrumpe el flujo).
      if (urlPdfAnterior) {
        await this.contratoService.eliminarPdfStorage(urlPdfAnterior).catch(() => {});
      }

      // 4 — Contrato recién creado por el RPC.
      const contratoRow = await this.contratoService.buscarPorExpediente(this.id);
      if (!contratoRow) throw new Error('admin_file_edit.save_error');

      // 5 — PDF con los datos persistidos del expediente.
      const datos = await this.expedienteService.getExpedienteParaEdicion(this.id);
      const cli   = this.clientes().find(c => c.id === datos.cliente_id);
      const svc   = this.serviciosLocalizados().find(s => s.id === datos.servicio_id);
      const lang  = this.translate.currentLang ?? 'fr';

      const pdfBlob = this.contratoService.generarPdfBlob({
        contratoId:          contratoRow.id,
        expedienteNumero:    datos.numero,
        fechaGenerado:       this.formatFecha(new Date().toISOString()),
        clienteNombre:       cli ? `${cli.nombre} ${cli.apellido}`.trim() : '—',
        constructorNombre:   oferta.constructor_nombre,
        constructorTelefono: oferta.constructor_telefono,
        constructorEmail:    oferta.constructor_email,
        servicioNombre:      svc?.nombre_local      ?? '—',
        servicioDescripcion: svc?.descripcion_local ?? '',
        direccion:           datos.direccion ?? '—',
        canton:              datos.canton    ?? '—',
        provincia:           datos.provincia ?? '—',
        distrito:            datos.distrito  ?? '',
        precioFinal:         oferta.precio,
        plazoMin:            oferta.plazo_semanas_min,
        plazoMax:            oferta.plazo_semanas_max,
        garantiaAnos:        oferta.garantia_anos,
        fechaInicio:         oferta.fecha_inicio,
        descripcionTrabajo:  oferta.descripcion,
        lang,
      });

      // 6 — Subir el PDF y enlazarlo al contrato.
      const urlPdf = await this.contratoService.subirPdf(pdfBlob, contratoRow.id);
      await this.contratoService.actualizarUrlPdf(contratoRow.id, urlPdf);

      // 7 — Reflejar el nuevo estado sin recargar la página.
      this.estadoActual.set('adjudicado');
      this.ofertas.update(lista =>
        lista.map(o => ({ ...o, estado: o.id === ofertaId ? 'aceptada' : 'rechazada' })),
      );
      await this.cargarContrato();
      this.exitoAdj.set('builder_offer.success_accepted');
    } catch (e: any) {
      console.error('[AdminFileEdit] adjudicarOferta:', e);
      this.errorAdj.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.adjudicando.set(false);
    }
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

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
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
      this.cargarEstimadores(),
    ]);
    await Promise.all([
      this.cargarExpediente(),
      this.cargarEstimacion(),
      this.cargarOfertas(),
      this.cargarContrato(),
      this.cargarArchivos(),
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

  private async cargarEstimadores() {
    try {
      const lista = await this.perfilRepo.findByRoles(['estimador', 'administrador'] as const);
      this.estimadores.set(lista);
    } catch (e: any) {
      console.error('[AdminFileEdit] estimadores:', e.message);
    }
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
      this.estimadorSeleccionadoId.set(detalle.estimador_id ?? '');
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

  private async cargarEstimacion() {
    try {
      const est = await this.estimacionService.get(this.id);
      if (!est) return;
      if (est.fecha_visita_real) {
        this.fechaVisitaReal = est.fecha_visita_real.slice(0, 10);
        this.horaVisitaReal  = est.fecha_visita_real.slice(11, 16);
      }
      this.descripcionProblema = est.descripcion_problemas ?? '';
      this.costoMin            = est.costo_estimado;
      this.costoMax            = est.costo_estimado_max;
      this.notasInternas       = est.notas_internas ?? '';
      this.urlsTour.set(EstimacionService.parseUrls(est.url_tour));
      this.hasEstimacion.set(true);
    } catch (e: any) {
      console.error('[AdminFileEdit] cargarEstimacion:', e.message);
    }
  }

  private async cargarArchivos() {
    try {
      const { fotos, documentos } = await this.archivoService.cargarTodos(this.id);
      this.fotos.set(fotos);
      this.documentos.set(documentos);
    } catch (e: any) {
      console.error('[AdminFileEdit] cargarArchivos:', e.message);
    }
  }

  private async cargarOfertas() {
    try {
      const lista = await this.ofertaService.getOfertasDeExpediente(this.id);
      this.ofertas.set(lista);
      const primaria = lista.find(o => o.estado === 'aceptada') ?? lista[0] ?? null;
      if (primaria) this.seleccionarOferta(primaria);
    } catch (e: any) {
      console.error('[AdminFileEdit] cargarOfertas:', e.message);
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

  // ── Guardar: ESTIMADOR ─────────────────────────────────────────────────────
  async guardarEstimacion() {
    this.exitoEst.set(false);
    this.errorEst.set('');

    if (!this.fechaVisitaReal || !this.horaVisitaReal) {
      this.errorEst.set('estimator_form.err_visit');
      return;
    }
    if (!this.descripcionProblema.trim()) {
      this.errorEst.set('estimator_form.err_problems');
      return;
    }
    if (!this.costoValido) {
      this.errorEst.set('estimator_form.err_cost');
      return;
    }
    const estimadorId = this.estimadorSeleccionadoId();
    if (!estimadorId) {
      this.errorEst.set('admin_estimate.err_estimador');
      return;
    }

    this.guardandoEst.set(true);
    try {
      await this.estimacionService.guardar(this.id, estimadorId, {
        fechaVisita:          this.fechaVisitaReal,
        horaVisita:           this.horaVisitaReal,
        descripcionProblemas: this.descripcionProblema.trim(),
        costoMin:             this.costoMin,
        costoMax:             this.costoMax,
        notasInternas:        this.notasInternas.trim(),
        urlTour:              EstimacionService.serializeUrls(
          this.urlsTour().map(u => u.trim()).filter(Boolean),
        ),
      });
      // Asigna el estimador al expediente solo si aún es 'nuevo' (evita
      // retroceder el estado de un expediente ya avanzado).
      if (this.estadoActual() === 'nuevo') {
        await this.expedienteService.asignarEstimador(this.id, estimadorId);
        this.estadoActual.set('en_estimacion');
      }
      const est = this.estimadores().find(x => x.id === estimadorId);
      if (est) this.estimadorActual.set(`${est.nombre} ${est.apellido}`.trim());
      this.hasEstimacion.set(true);
      this.exitoEst.set(true);
    } catch (e: any) {
      this.errorEst.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoEst.set(false);
    }
  }

  // ── Tours virtuales 3D ─────────────────────────────────────────────────────
  tourThumb(url: string): string | null {
    return matterportThumb(url);
  }

  async agregarTour() {
    const url = this.nuevoTourUrl.trim();
    if (!url) return;
    const nuevaLista = [...this.urlsTour(), url];
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      // Si ya existe una estimación, persiste de inmediato; si no, se guardará
      // junto con el informe al pulsar "Guardar informe".
      if (this.hasEstimacion()) {
        await this.estimacionService.actualizarUrlsTour(this.id, nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
      this.nuevoTourUrl = '';
    } catch (e: any) {
      this.errorTour.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoTour.set(false);
    }
  }

  async eliminarTour(i: number) {
    const nuevaLista = this.urlsTour().filter((_, idx) => idx !== i);
    this.errorTour.set('');
    this.guardandoTour.set(true);
    try {
      if (this.hasEstimacion()) {
        await this.estimacionService.actualizarUrlsTour(this.id, nuevaLista);
      }
      this.urlsTour.set(nuevaLista);
    } catch (e: any) {
      this.errorTour.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoTour.set(false);
    }
  }

  // ── Fotos del sitio / Documentos técnicos ──────────────────────────────────
  // El `accept` de un <input file> sólo filtra el diálogo, no el arrastre. Como
  // FILE_LIMITS.DOCUMENTO.types admite '' (MIME vacío de .csv/.txt), un archivo
  // soltado con MIME desconocido pasaría: se valida también la extensión.
  private readonly DOC_EXT = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv'];

  async subirFotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.procesarFotos(files);
  }

  async subirDocumentos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.procesarDocumentos(files);
  }

  private async procesarFotos(files: File[]) {
    if (!files.length || this.subiendoFoto()) return;
    const userId = this.user()?.id;
    if (!userId) { this.errorFotos.set('estimator_form.err_session'); return; }
    this.errorFotos.set('');
    for (const file of files) {
      const err = validateFile(file, FILE_LIMITS.FOTO.maxBytes, FILE_LIMITS.FOTO.types);
      if (err) { this.errorFotos.set(err); return; }
    }
    this.subiendoFoto.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.id, 'foto', file, userId);
      this.fotos.set(await this.archivoService.cargarPorTipo(this.id, 'foto'));
    } catch (e: any) {
      this.errorFotos.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  private async procesarDocumentos(files: File[]) {
    if (!files.length || this.subiendoDoc()) return;
    const userId = this.user()?.id;
    if (!userId) { this.errorDocs.set('estimator_form.err_session'); return; }
    this.errorDocs.set('');
    for (const file of files) {
      const nombre = file.name.toLowerCase();
      const punto  = nombre.lastIndexOf('.');
      const ext    = punto >= 0 ? nombre.slice(punto) : '';
      if (!this.DOC_EXT.includes(ext)) { this.errorDocs.set('validation.file_type'); return; }
      const err = validateFile(file, FILE_LIMITS.DOCUMENTO.maxBytes, FILE_LIMITS.DOCUMENTO.types);
      if (err) { this.errorDocs.set(err); return; }
    }
    this.subiendoDoc.set(true);
    try {
      for (const file of files) await this.archivoService.subir(this.id, 'documento', file, userId);
      this.documentos.set(await this.archivoService.cargarPorTipo(this.id, 'documento'));
    } catch (e: any) {
      this.errorDocs.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.subiendoDoc.set(false);
    }
  }

  // ── Arrastrar y soltar ─────────────────────────────────────────────────────
  dragFotos = signal(false);
  dragDocs  = signal(false);

  onDragOverFotos(e: DragEvent) {
    e.preventDefault();
    if (!this.subiendoFoto()) this.dragFotos.set(true);
  }
  onDragLeaveFotos() { this.dragFotos.set(false); }
  async onDropFotos(e: DragEvent) {
    e.preventDefault();
    this.dragFotos.set(false);
    await this.procesarFotos(Array.from(e.dataTransfer?.files ?? []));
  }

  onDragOverDocs(e: DragEvent) {
    e.preventDefault();
    if (!this.subiendoDoc()) this.dragDocs.set(true);
  }
  onDragLeaveDocs() { this.dragDocs.set(false); }
  async onDropDocs(e: DragEvent) {
    e.preventDefault();
    this.dragDocs.set(false);
    await this.procesarDocumentos(Array.from(e.dataTransfer?.files ?? []));
  }

  async eliminarArchivo(archivo: ArchivoRow, tipo: TipoArchivo) {
    const setError = tipo === 'foto' ? this.errorFotos : this.errorDocs;
    setError.set('');
    this.eliminandoArchivo.set(archivo.id);
    try {
      await this.archivoService.eliminar(archivo);
      const lista = await this.archivoService.cargarPorTipo(this.id, tipo);
      if (tipo === 'foto') this.fotos.set(lista); else this.documentos.set(lista);
    } catch (e: any) {
      setError.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.eliminandoArchivo.set(null);
    }
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }
  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }
  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }
  cerrarFoto() { this.fotoAmpliada.set(null); }
  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  // ── Guardar: CONSTRUCTOR (oferta) ──────────────────────────────────────────
  seleccionarOferta(oferta: OfertaConConstructor) {
    this.ofertaId.set(oferta.id);
    this.constructorId    = oferta.constructor_id;
    this.precio           = oferta.precio;
    this.plazoMin         = oferta.plazo_semanas_min;
    this.plazoMax         = oferta.plazo_semanas_max;
    this.garantiaAnos     = oferta.garantia_anos;
    this.fechaInicio      = oferta.fecha_inicio;
    this.descripcionOferta = oferta.descripcion;
    this.exitoOf.set(false);
    this.errorOf.set('');
    this.exitoAdj.set('');
    this.errorAdj.set('');
  }

  async guardarOferta() {
    this.exitoOf.set(false);
    this.errorOf.set('');

    if (!this.ofertaId()) { this.errorOf.set('admin_file_edit.constructor_no_offers'); return; }
    if (!this.precio || this.precio <= 0)       { this.errorOf.set('make_offer.err_price'); return; }
    if (!this.plazoMin || this.plazoMin <= 0)   { this.errorOf.set('make_offer.err_plazo_min'); return; }
    if (!this.plazoMax || this.plazoMax < this.plazoMin) { this.errorOf.set('make_offer.err_plazo_max'); return; }
    if (!this.fechaInicio)                      { this.errorOf.set('make_offer.err_date'); return; }
    if (!this.descripcionOferta.trim())         { this.errorOf.set('make_offer.err_desc'); return; }

    const form: OfertaForm = {
      precio:            this.precio,
      plazo_semanas_min: this.plazoMin,
      plazo_semanas_max: this.plazoMax,
      garantia_anos:     this.garantiaAnos,
      fecha_inicio:      this.fechaInicio,
      descripcion:       this.descripcionOferta.trim(),
    };

    this.guardandoOf.set(true);
    try {
      await this.ofertaService.actualizar(this.ofertaId()!, this.constructorId, form, null);
      this.ofertas.set(await this.ofertaService.getOfertasDeExpediente(this.id));
      this.exitoOf.set(true);
    } catch (e: any) {
      this.errorOf.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoOf.set(false);
    }
  }

  volver() { this.router.navigate(['/admin/file']); }
}
