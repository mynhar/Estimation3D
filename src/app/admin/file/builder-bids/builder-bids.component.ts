import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { OfertaService } from '../../../services/oferta.service';
import { ContratoService } from '../../../services/contrato.service';
import { ArchivoService } from '../../../services/archivo.service';
import {
  OfertaForm, OfertaConConstructor, ArchivoRow, ESTADO_BADGE_OFERTA,
  serviciosParaContrato, serviciosDeOferta,
} from '../../../models';
import { OfertaRepartoComponent, alternarEnSeleccion } from '../../../shared/ui/oferta-reparto/oferta-reparto.component';

/**
 * Ofertas de constructores de un expediente (admin).
 * Extraído de admin/file/edit: lista de ofertas con selección y adjudicación
 * (regeneración del PDF del contrato incluida) + edición de la oferta
 * seleccionada.
 */
@Component({
  selector: 'app-admin-file-builder-bids',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, OfertaRepartoComponent],
  templateUrl: './builder-bids.component.html',
  styleUrl: './builder-bids.component.css',
})
export class AdminFileBuilderBidsComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private ofertaService     = inject(OfertaService);
  private contratoService   = inject(ContratoService);
  private archivoService    = inject(ArchivoService);
  private translate         = inject(TranslateService);

  /** Id del expediente cuyas ofertas se gestionan. */
  expedienteId = input.required<string>();
  /** Estado actual del expediente (lo mantiene el padre). */
  estado = input<string>('');

  /** La adjudicación cambió el estado del expediente ('adjudicado'). */
  estadoChange = output<string>();
  /** Se adjudicó una oferta: el padre debe recargar el contrato. */
  adjudicada = output<void>();

  // ── Ofertas ────────────────────────────────────────────────────────────────
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

  get puedeEditarOferta(): boolean {
    return this.estado() !== 'contratado';
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
    const e = this.estado();
    return e === 'adjudicado' || e === 'contratado';
  });

  puedeAdjudicar = computed(() => {
    if (!this.ofertaId() || this.adjudicando())                   return false;
    if (!this.ESTADOS_ADJUDICABLES.includes(this.estado()))       return false;
    // Ya adjudicado: sólo tiene sentido cambiar a una oferta distinta.
    if (this.estado() === 'adjudicado') {
      return this.ofertaSeleccionada()?.estado !== 'aceptada';
    }
    return true;
  });

  esSeleccionada(ofertaId: string): boolean { return this.ofertaId() === ofertaId; }

  // ── Reparto en bloque ──────────────────────────────────────────────────────
  // Dos «selecciones» conviven aquí y no son lo mismo: `ofertaId` es la oferta
  // abierta abajo para editar (una sola), y `seleccion` es el conjunto marcado
  // con las casillas para rechazar, reactivar o adjudicar en bloque. Rechazar y
  // reactivar están en <app-oferta-reparto>, compartido con admin/offer/edit;
  // adjudicar vive aquí porque el PDF se arma con datos propios de la pantalla.
  seleccion = signal<ReadonlySet<string>>(new Set());

  /**
   * Cuándo se pinta la casilla. Más amplio que el bloqueo de la barra a
   * propósito: en 'adjudicado' rechazar y reactivar están vetados (la base los
   * rechaza con un contrato vivo), pero re-adjudicar SÍ se permite, y sin
   * casillas no habría forma de elegir a quién.
   */
  puedeSeleccionar = computed(() => this.estado() !== 'contratado');

  confirmandoAdjudicarSeleccion = signal(false);

  /** Marcadas que se pueden adjudicar: las vivas. */
  seleccionadasParaAdjudicar = computed(() =>
    this.ofertas().filter(o => !o.eliminada_en && this.seleccion().has(o.id)));

  /** El RPC sólo adjudica desde 'en_oferta' o 'adjudicado'. */
  puedeAdjudicarSeleccion = computed(() =>
    this.ESTADOS_ADJUDICABLES.includes(this.estado())
    && this.seleccionadasParaAdjudicar().length > 0);

  /** Una oferta dada de baja se ve, pero no se marca ni se edita. */
  esEliminada(oferta: OfertaConConstructor): boolean { return !!oferta.eliminada_en; }

  estaMarcada(oferta: OfertaConConstructor): boolean { return this.seleccion().has(oferta.id); }

  alternarMarca(oferta: OfertaConConstructor): void {
    this.seleccion.update(actual => alternarEnSeleccion(actual, oferta.id));
  }

  /** El reparto ya se aplicó en la base: releer. */
  async onRepartoAplicado(): Promise<void> {
    await this.cargarOfertas();
  }

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

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.cargarOfertas();
  }

  /**
   * `true` = incluir las dadas de baja: esta pantalla es de administración y el
   * requisito es que «Ofertas recibidas» no esconda nada. Se ordenan por estado
   * —aceptada, pendiente, rechazada— y las bajas al final, para que las vivas
   * que se están comparando no queden intercaladas.
   */
  private async cargarOfertas() {
    try {
      const lista = await this.ofertaService.getOfertasDeExpediente(this.expedienteId(), true);
      const peso: Record<string, number> = { aceptada: 0, pendiente: 1, rechazada: 2 };
      const rango = (o: OfertaConConstructor) => (o.eliminada_en ? 10 : 0) + (peso[o.estado] ?? 3);
      this.ofertas.set([...lista].sort((a, b) => rango(a) - rango(b)));

      // El formulario de abajo sólo edita ofertas vivas.
      const vivas    = this.ofertas().filter(o => !o.eliminada_en);
      const primaria = vivas.find(o => o.estado === 'aceptada') ?? vivas[0] ?? null;
      if (primaria) this.seleccionarOferta(primaria);
    } catch (e: any) {
      console.error('[AdminFileBuilderBids] cargarOfertas:', e.message);
      this.errorOf.set(e.message);
    }
  }

  /** El botón de la oferta abierta: adjudicar sólo ésa. */
  async adjudicarOferta() {
    const ofertaId = this.ofertaId();
    if (!ofertaId || !this.puedeAdjudicar()) return;
    await this.adjudicar([ofertaId]);
  }

  /** «Adjudicar selección»: una, varias o todas las marcadas. */
  async adjudicarSeleccion() {
    this.confirmandoAdjudicarSeleccion.set(false);
    await this.adjudicar(this.seleccionadasParaAdjudicar().map(o => o.id));
  }

  /**
   * Adjudica N ofertas: el RPC crea UN CONTRATO POR OFERTA en una transacción y
   * devuelve los contratos creados; aquí se genera y sube un PDF para cada uno.
   *
   * Los datos del expediente, el cliente y los servicios se leen UNA vez y se
   * reutilizan en todos los PDF: son los mismos para todos los contratos y
   * repetir las consultas por cada oferta no aporta nada.
   *
   * Un fallo generando un PDF no deshace la adjudicación: los contratos ya están
   * en la base. Se informa de cuántos PDF salieron para poder reintentarlo.
   */
  private async adjudicar(ofertaIds: string[]) {
    if (this.adjudicando() || !ofertaIds.length) return;

    this.adjudicando.set(true);
    this.errorAdj.set('');
    this.exitoAdj.set('');
    try {
      // Rutas de los PDF que el RPC va a sustituir: después ya no hay fila de
      // la que leerlas y quedarían huérfanas en el bucket.
      const pdfsAnteriores = (await this.contratoService.listarPorExpediente(this.expedienteId()))
        .map(c => c.url_pdf)
        .filter((u): u is string => !!u);

      const creados = await this.contratoService.adjudicarOfertas(this.expedienteId(), ofertaIds);

      for (const url of pdfsAnteriores) {
        await this.contratoService.eliminarPdfStorage(url).catch(() => {});
      }

      const lang  = this.translate.currentLang ?? 'fr';
      const datos = await this.expedienteService.getExpedienteParaEdicion(this.expedienteId());
      const [cli, serviciosExp] = await Promise.all([
        this.buscarCliente(datos.cliente_id),
        this.expedienteService.getServiciosCompletos(this.expedienteId()),
      ]);
      const fecha = this.formatFecha(new Date().toISOString());

      await this.cargarOfertas();

      let fallidos = 0;
      for (const { id_contrato, id_oferta } of creados) {
        const oferta = this.ofertas().find(o => o.id === id_oferta);
        if (!oferta) { fallidos++; continue; }
        try {
          // Cada contrato lleva los servicios de SU oferta, no los del expediente.
          const svc = serviciosParaContrato(serviciosDeOferta(serviciosExp, oferta), lang);
          const pdfBlob = this.contratoService.generarPdfBlob({
            contratoId:          id_contrato,
            expedienteNumero:    datos.numero,
            fechaGenerado:       fecha,
            clienteNombre:       cli ?? '—',
            constructorNombre:   oferta.constructor_nombre,
            constructorTelefono: oferta.constructor_telefono,
            constructorEmail:    oferta.constructor_email,
            servicios:           svc,
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
          const urlPdf = await this.contratoService.subirPdf(pdfBlob, id_contrato);
          await this.contratoService.actualizarUrlPdf(id_contrato, urlPdf);
        } catch {
          fallidos++;
        }
      }

      this.seleccion.set(new Set());
      this.estadoChange.emit('adjudicado');
      this.adjudicada.emit();
      this.exitoAdj.set(
        fallidos
          ? this.translate.instant('admin_offer.adjudicar_pdf_parcial', { n: creados.length - fallidos, total: creados.length })
          : this.translate.instant('admin_offer.adjudicar_ok', { n: creados.length }),
      );
    } catch (e: any) {
      console.error('[AdminFileBuilderBids] adjudicar:', e);
      this.errorAdj.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.adjudicando.set(false);
    }
  }

  /** Nombre completo del cliente para el PDF del contrato. */
  private async buscarCliente(clienteId: string | null): Promise<string | null> {
    if (!clienteId) return null;
    const { data } = await this.auth.client
      .from('perfil')
      .select('nombre, apellido')
      .eq('id', clienteId)
      .maybeSingle();
    return data ? `${data.nombre} ${data.apellido}`.trim() : null;
  }

  // ── Edición de la oferta seleccionada ──────────────────────────────────────
  seleccionarOferta(oferta: OfertaConConstructor) {
    // Una oferta dada de baja se consulta, no se edita: cargarla en el
    // formulario daría a entender que se puede guardar encima.
    if (this.esEliminada(oferta)) return;
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
      await this.cargarOfertas();
      this.exitoOf.set(true);
    } catch (e: any) {
      this.errorOf.set(e.message ?? 'admin_file_edit.save_error');
    } finally {
      this.guardandoOf.set(false);
    }
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────
  formatCosto(valor: number | null): string {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }
  verArchivo(archivo: ArchivoRow) {
    window.open(this.publicUrl(archivo.url_storage), '_blank');
  }
  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
}
