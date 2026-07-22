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
} from '../../../models';

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
  imports: [FormsModule, TranslatePipe],
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

  private async cargarOfertas() {
    try {
      const lista = await this.ofertaService.getOfertasDeExpediente(this.expedienteId());
      this.ofertas.set(lista);
      const primaria = lista.find(o => o.estado === 'aceptada') ?? lista[0] ?? null;
      if (primaria) this.seleccionarOferta(primaria);
    } catch (e: any) {
      console.error('[AdminFileBuilderBids] cargarOfertas:', e.message);
    }
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
      const contratoAnterior = await this.contratoService.buscarPorExpediente(this.expedienteId());
      const urlPdfAnterior   = contratoAnterior?.url_pdf ?? null;

      // 2 — Adjudicación en BD.
      await this.ofertaService.aceptarOferta(this.expedienteId(), ofertaId);

      // 3 — Borrar el PDF anterior (best-effort: no interrumpe el flujo).
      if (urlPdfAnterior) {
        await this.contratoService.eliminarPdfStorage(urlPdfAnterior).catch(() => {});
      }

      // 4 — Contrato recién creado por el RPC.
      const contratoRow = await this.contratoService.buscarPorExpediente(this.expedienteId());
      if (!contratoRow) throw new Error('admin_file_edit.save_error');

      // 5 — PDF con los datos persistidos del expediente.
      const datos = await this.expedienteService.getExpedienteParaEdicion(this.expedienteId());
      const [cli, svc] = await Promise.all([
        this.buscarCliente(datos.cliente_id),
        this.buscarServicio(datos.servicio_id),
      ]);
      const lang = this.translate.currentLang ?? 'fr';

      const pdfBlob = this.contratoService.generarPdfBlob({
        contratoId:          contratoRow.id,
        expedienteNumero:    datos.numero,
        fechaGenerado:       this.formatFecha(new Date().toISOString()),
        clienteNombre:       cli ?? '—',
        constructorNombre:   oferta.constructor_nombre,
        constructorTelefono: oferta.constructor_telefono,
        constructorEmail:    oferta.constructor_email,
        servicioNombre:      svc?.nombre      ?? '—',
        servicioDescripcion: svc?.descripcion ?? '',
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
      this.estadoChange.emit('adjudicado');
      this.ofertas.update(lista =>
        lista.map(o => ({ ...o, estado: o.id === ofertaId ? 'aceptada' : 'rechazada' })),
      );
      this.adjudicada.emit();
      this.exitoAdj.set('builder_offer.success_accepted');
    } catch (e: any) {
      console.error('[AdminFileBuilderBids] adjudicarOferta:', e);
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

  /** Nombre y descripción localizados del servicio para el PDF del contrato. */
  private async buscarServicio(servicioId: number | null): Promise<{ nombre: string; descripcion: string } | null> {
    if (servicioId == null) return null;
    const { data } = await this.auth.client
      .from('servicio')
      .select('nombre_fr, nombre_en, nombre_es, descripcion_fr, descripcion_en, descripcion_es')
      .eq('id', servicioId)
      .maybeSingle();
    if (!data) return null;
    const lang = this.translate.currentLang;
    const s = data as Record<string, string | null>;
    return {
      nombre:
        lang === 'en' ? (s['nombre_en'] || s['nombre_fr'] || s['nombre_es'] || '')
      : lang === 'es' ? (s['nombre_es'] || s['nombre_fr'] || '')
      :                 (s['nombre_fr'] || s['nombre_es'] || ''),
      descripcion:
        lang === 'en' ? (s['descripcion_en'] || s['descripcion_fr'] || s['descripcion_es'] || '')
      : lang === 'es' ? (s['descripcion_es'] || s['descripcion_fr'] || '')
      :                 (s['descripcion_fr'] || s['descripcion_es'] || ''),
    };
  }

  // ── Edición de la oferta seleccionada ──────────────────────────────────────
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
      this.ofertas.set(await this.ofertaService.getOfertasDeExpediente(this.expedienteId()));
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
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
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
