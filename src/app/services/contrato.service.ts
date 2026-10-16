import { Injectable, inject } from '@angular/core';
import { ContratoAdminDetalle, ContratoAdminListItem, ContratoConstructorListItem, ContratoInput, ContratoObraResumen, ContratoPanelCliente, ContratoPdfData, ContratoListItem, ObraEstadoPanel, ServicioContrato } from '../models';
import { ContratoRepository } from '../data/contrato.repository';
import { OfertaRepository } from '../data/oferta.repository';
import { EstimacionRepository } from '../data/estimacion.repository';
import { ServicioRepository } from '../data/servicio.repository';
import { generarContratoPdfBlob } from '../shared/contrato-pdf';
import { matterportThumbFromTour } from '../shared/util/matterport';

@Injectable({ providedIn: 'root' })
export class ContratoService {
  private contratoRepo = inject(ContratoRepository);
  private ofertaRepo   = inject(OfertaRepository);
  private estimacionRepo = inject(EstimacionRepository);
  private servicioRepo   = inject(ServicioRepository);

  // ── Listar contratos del cliente ─────────────────────────────────────────

  async getMisContratos(clienteId: string): Promise<ContratoListItem[]> {
    const rows  = await this.contratoRepo.findByClienteId(clienteId);
    const items = this.mapMisContratos(rows);
    await this.adjuntarServicios(items, rows);
    return items;
  }

  private mapMisContratos(rows: any[]): ContratoListItem[] {
    return rows.map((c: any) => {
      const svc    = c.expediente?.servicio;
      const locArr = c.expediente?.localizacion;
      const loc    = Array.isArray(locArr) ? locArr[0] : locArr;
      const con    = c.constructor;
      const cli    = c.cliente;
      const ofe    = Array.isArray(c.oferta) ? c.oferta[0] : c.oferta;
      return {
        id:                 c.id,
        expediente_id:      c.expediente_id                  ?? '',
        expediente_numero:  c.expediente?.numero             ?? '—',
        servicio_nombre:    svc?.nombre_es                   ?? '—',
        servicio_nombre_en: svc?.nombre_en ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr: svc?.nombre_fr ?? svc?.nombre_es ?? '—',
        servicio_desc:      svc?.descripcion_es              ?? '',
        servicio_desc_en:   svc?.descripcion_en              ?? '',
        servicio_desc_fr:   svc?.descripcion_fr              ?? '',
        constructor_nombre:   con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || '—' : '—',
        constructor_telefono: con?.telefono ?? '—',
        constructor_email:    con?.email    ?? '—',
        cliente_nombre:       cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
        direccion:  loc?.direccion  ?? '—',
        provincia:  loc?.provincia  ?? '—',
        canton:     loc?.canton     ?? '—',
        distrito:   loc?.distrito   ?? null,
        precio_final:      c.precio_final,
        garantia_anos:     c.garantia_anos        ?? null,
        plazo_semanas_min: ofe?.plazo_semanas_min ?? null,
        plazo_semanas_max: ofe?.plazo_semanas_max ?? null,
        fecha_inicio:      ofe?.fecha_inicio      ?? '',
        descripcion_trabajo: c.descripcion_trabajo ?? '',
        estado:             c.estado,
        generado_en:        c.generado_en  ?? '',
        firmado_en:         c.firmado_en   ?? null,
        url_pdf:            c.url_pdf      ?? null,
        obra_terminada:     this.obraTerminada(c),
      } as ContratoListItem;
    });
  }

  // ── Listas del cliente: qué contratos tienen la obra al 100 % ───────────

  /**
   * Contratos de varios expedientes con su marca de obra terminada y sus
   * servicios (para nombrar cada contrato). El más antiguo primero.
   */
  async getResumenObraExpedientes(expedienteIds: string[]): Promise<ContratoObraResumen[]> {
    const rows  = await this.contratoRepo.findResumenObraByExpedienteIds(expedienteIds);
    const items: ContratoObraResumen[] = rows.map((c: any) => ({
      id:             c.id,
      expediente_id:  c.expediente_id,
      oferta_id:      c.oferta_id,
      estado:         c.estado,
      servicios:      [],
      obra_terminada: this.obraTerminada(c),
    }));
    await this.adjuntarServicios(items, rows);
    return items;
  }

  // ── Panel del cliente: contratos de un expediente ───────────────────────

  /**
   * Todos los contratos del expediente con el avance de su obra, para el panel
   * del cliente. Los cancelados vienen también: el panel los enseña, pero no
   * cuentan en el costo ni en el avance global.
   */
  async getPanelClienteExpediente(expedienteId: string): Promise<ContratoPanelCliente[]> {
    const rows  = await this.contratoRepo.findPanelClienteByExpedienteId(expedienteId);
    const items = rows.map((c: any) => this.mapPanelCliente(c));

    const paths = rows.map((c: any) => c.url_pdf as string | null).filter((p): p is string => !!p);
    const [urls] = await Promise.all([
      this.contratoRepo.getSignedUrls(paths).catch(() => new Map<string, string>()),
      this.adjuntarServicios(items, rows),
    ]);
    items.forEach((it, i) => {
      it.pdf_url = rows[i].url_pdf ? urls.get(rows[i].url_pdf) ?? null : null;
    });
    return items;
  }

  private mapPanelCliente(c: any): ContratoPanelCliente {
    const con = Array.isArray(c.constructor) ? c.constructor[0] : c.constructor;
    const ofe = Array.isArray(c.oferta)      ? c.oferta[0]      : c.oferta;
    const seg = Array.isArray(c.seguimiento) ? c.seguimiento[0] : c.seguimiento;

    // Un contrato completado es una obra al 100 %, la haya cerrado o no el
    // seguimiento. Sin seguimiento la obra no ha arrancado: 0 %.
    const avance = c.estado === 'completado'
      ? 100
      : Math.min(100, Math.max(0, Math.round(Number(seg?.porcentaje_avance ?? 0))));

    let obraEstado: ObraEstadoPanel;
    if (c.estado === 'cancelado')                                       obraEstado = 'cancelada';
    else if (c.estado === 'completado' || seg?.estado === 'completado') obraEstado = 'completada';
    else if (seg?.estado === 'pausado')                                 obraEstado = 'pausada';
    else if (seg?.estado === 'en_progreso' || avance > 0)               obraEstado = 'en_curso';
    else                                                                obraEstado = 'por_iniciar';

    return {
      id:                   c.id,
      estado:               c.estado,
      precio_final:         Number(c.precio_final ?? 0),
      garantia_anos:        c.garantia_anos       ?? null,
      descripcion_trabajo:  c.descripcion_trabajo ?? '',
      generado_en:          c.generado_en         ?? '',
      firmado_en:           c.firmado_en          ?? null,
      actualizado_en:       c.actualizado_en      ?? '',
      fecha_inicio:         ofe?.fecha_inicio     ?? null,
      pdf_url:              null,
      constructor_nombre:   con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || '—' : '—',
      constructor_telefono: con?.telefono ?? null,
      constructor_email:    con?.email    ?? null,
      servicios:            [],
      avance_obra:          avance,
      obra_estado:          obraEstado,
      obra_actualizado_en:  seg?.actualizado_en ?? null,
    };
  }

  // ── Buscar contrato existente por expediente ─────────────────────────────

  /** El contrato más reciente del expediente. Para flujos de un solo contrato. */
  async buscarPorExpediente(
    expedienteId: string,
  ): Promise<{ id: string; oferta_id: string; url_pdf: string | null } | null> {
    return this.contratoRepo.findSimpleByExpedienteId(expedienteId);
  }

  /** Todos los contratos del expediente: administración puede adjudicar varios. */
  async listarPorExpediente(
    expedienteId: string,
  ): Promise<{ id: string; oferta_id: string; url_pdf: string | null }[]> {
    return this.contratoRepo.findSimplesByExpedienteId(expedienteId);
  }

  /**
   * Adjudica varias ofertas: un contrato por oferta, atómico. Devuelve los
   * contratos creados; el PDF de cada uno lo genera quien llama, que es quien
   * tiene los datos del expediente a mano.
   */
  async adjudicarOfertas(
    expedienteId: string,
    ofertaIds: string[],
  ): Promise<{ id_contrato: string; id_oferta: string }[]> {
    return this.contratoRepo.adjudicarOfertas(expedienteId, ofertaIds);
  }

  async eliminarContrato(contratoId: string, pdfPath: string | null): Promise<void> {
    if (pdfPath) await this.contratoRepo.removePdfFromStorage(pdfPath);
    await this.contratoRepo.deleteById(contratoId);
  }

  async eliminarPdfStorage(pdfPath: string): Promise<void> {
    return this.contratoRepo.removePdfFromStorage(pdfPath);
  }

  /** El cliente cancela uno de sus contratos. No toca los demás del expediente. */
  async cancelarContrato(contratoId: string): Promise<void> {
    return this.contratoRepo.cancelarCliente(contratoId);
  }

  async rechazarOferta(expedienteId: string, ofertaId: string): Promise<void> {
    return this.ofertaRepo.rechazar(expedienteId, ofertaId);
  }

  async cancelarContratoAdmin(contratoId: string): Promise<void> {
    return this.contratoRepo.cancelarAdmin(contratoId);
  }

  async firmarContratoAdmin(contratoId: string): Promise<void> {
    return this.contratoRepo.firmarAdmin(contratoId);
  }

  async iniciarEjecucionContratoAdmin(contratoId: string): Promise<void> {
    return this.contratoRepo.iniciarEjecucionAdmin(contratoId);
  }

  // Constructor adjudicado: inicia la ejecución de su propio contrato.
  async iniciarEjecucionContrato(contratoId: string): Promise<void> {
    return this.contratoRepo.iniciarEjecucion(contratoId);
  }

  async completarContratoAdmin(contratoId: string): Promise<void> {
    return this.contratoRepo.completarAdmin(contratoId);
  }

  async firmarContrato(contratoId: string): Promise<void> {
    return this.contratoRepo.firmar(contratoId);
  }

  // ── Insertar / actualizar contrato ───────────────────────────────────────

  async crearContrato(input: ContratoInput): Promise<string> {
    return this.contratoRepo.insert(input);
  }

  async actualizarUrlPdf(contratoId: string, urlPdf: string): Promise<void> {
    return this.contratoRepo.updateUrlPdf(contratoId, urlPdf);
  }

  // ── Storage: PDF ─────────────────────────────────────────────────────────

  async subirPdf(pdfBlob: Blob, contratoId: string): Promise<string> {
    return this.contratoRepo.uploadPdf(pdfBlob, contratoId);
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    return this.contratoRepo.getSignedUrl(path, expiresInSeconds);
  }

  // ── Admin: detalle de un contrato ────────────────────────────────────────

  /** El servicio principal del expediente como lista de uno: lo que se enseñaba antes. */
  private respaldoPrincipal(principal: Record<string, string | null> | null): ServicioContrato[] {
    return principal ? [{
      id:             -1,
      nombre_es:      principal['nombre_es'] ?? '—',
      nombre_en:      principal['nombre_en'] ?? null,
      nombre_fr:      principal['nombre_fr'] ?? null,
      descripcion_es: principal['descripcion_es'] ?? null,
      descripcion_en: principal['descripcion_en'] ?? null,
      descripcion_fr: principal['descripcion_fr'] ?? null,
    }] : [];
  }

  /** Catálogo de servicios por id. Si falla, vacío: cada contrato cae a su principal. */
  private async catalogoServicios(ids: number[]): Promise<Map<number, ServicioContrato>> {
    try {
      const catalogo = await this.servicioRepo.findByIdsCompleto([...new Set(ids)]);
      return new Map(catalogo.map(s => [s.id, s]));
    } catch (e) {
      console.error('[ContratoService] servicios del contrato:', e);
      return new Map();
    }
  }

  /**
   * Servicios de un contrato (`contrato.servicio_ids`, copia de los de su
   * oferta al adjudicar), en el orden guardado. Sin ellos, el principal.
   */
  private serviciosDe(
    servicioIds: number[] | null | undefined,
    catalogo:    Map<number, ServicioContrato>,
    principal:   Record<string, string | null> | null,
  ): ServicioContrato[] {
    const lista = (servicioIds ?? [])
      .map(id => catalogo.get(id))
      .filter((s): s is ServicioContrato => !!s);
    return lista.length ? lista : this.respaldoPrincipal(principal);
  }

  private async serviciosDelContrato(
    servicioIds: number[] | null | undefined,
    principal:   Record<string, string | null> | null,
  ): Promise<ServicioContrato[]> {
    const catalogo = servicioIds?.length ? await this.catalogoServicios(servicioIds) : new Map();
    return this.serviciosDe(servicioIds, catalogo, principal);
  }

  async getContratoAdminById(contratoId: string): Promise<ContratoAdminDetalle> {
    const c   = await this.contratoRepo.findDetalleById(contratoId);
    const exp = Array.isArray(c.expediente) ? c.expediente[0] : c.expediente;
    const svc = exp?.servicio    ? (Array.isArray(exp.servicio)    ? exp.servicio[0]    : exp.servicio)    : null;
    const loc = exp?.localizacion ? (Array.isArray(exp.localizacion) ? exp.localizacion[0] : exp.localizacion) : null;
    const cli = Array.isArray(c.cliente)     ? c.cliente[0]     : c.cliente;
    const con = Array.isArray(c.constructor) ? c.constructor[0] : c.constructor;
    const ofe = Array.isArray(c.oferta)      ? c.oferta[0]      : c.oferta;

    let estimadorNombre:    string | null = null;
    let estimadorTelefono:  string | null = null;
    let estimadorEmail:     string | null = null;
    if (exp?.estimador_id) {
      const p = await this.contratoRepo.findPerfilById(exp.estimador_id);
      if (p) {
        estimadorNombre   = `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || null;
        estimadorTelefono = p.telefono ?? null;
        estimadorEmail    = p.email    ?? null;
      }
    }

    const servicios = await this.serviciosDelContrato(c.servicio_ids, svc);

    return {
      id:                   c.id,
      precio_final:         c.precio_final,
      garantia_anos:        c.garantia_anos        ?? null,
      estado:               c.estado,
      generado_en:          c.generado_en          ?? '',
      firmado_en:           c.firmado_en           ?? null,
      url_pdf:              c.url_pdf              ?? null,
      descripcion_trabajo:  c.descripcion_trabajo  ?? '',
      expediente_id:        exp?.id                ?? '',
      expediente_numero:    exp?.numero            ?? '—',
      expediente_estado:    exp?.estado            ?? '',
      servicio_nombre:      svc?.nombre_es         ?? '—',
      servicio_nombre_en:   svc?.nombre_en ?? svc?.nombre_es ?? '—',
      servicio_nombre_fr:   svc?.nombre_fr ?? svc?.nombre_es ?? '—',
      servicio_desc:        svc?.descripcion_es    ?? '',
      servicio_desc_en:     svc?.descripcion_en    ?? '',
      servicio_desc_fr:     svc?.descripcion_fr    ?? '',
      direccion:            loc?.direccion         ?? '—',
      provincia:            loc?.provincia         ?? '—',
      canton:               loc?.canton            ?? '—',
      distrito:             loc?.distrito          ?? null,
      cliente_nombre:       cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
      cliente_telefono:     cli?.telefono          ?? '—',
      cliente_email:        cli?.email             ?? '—',
      constructor_id:       c.constructor_id        ?? '',
      constructor_nombre:   con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || '—' : '—',
      constructor_telefono: con?.telefono          ?? '—',
      constructor_email:    con?.email             ?? '—',
      estimador_nombre:     estimadorNombre,
      estimador_telefono:   estimadorTelefono,
      estimador_email:      estimadorEmail,
      oferta_id:            ofe?.id                ?? '',
      servicios,
      oferta_fecha_inicio:  ofe?.fecha_inicio      ?? null,
      plazo_semanas_min:    ofe?.plazo_semanas_min ?? null,
      plazo_semanas_max:    ofe?.plazo_semanas_max ?? null,
    };
  }

  // ── Constructor: detalle de un contrato ─────────────────────────────────

  async getContratoMonitoringById(contratoId: string, constructorId: string): Promise<ContratoAdminDetalle> {
    const c   = await this.contratoRepo.findDetalleByIdForConstructor(contratoId, constructorId);
    const exp = Array.isArray(c.expediente) ? c.expediente[0] : c.expediente;
    const svc = exp?.servicio    ? (Array.isArray(exp.servicio)    ? exp.servicio[0]    : exp.servicio)    : null;
    const loc = exp?.localizacion ? (Array.isArray(exp.localizacion) ? exp.localizacion[0] : exp.localizacion) : null;
    const cli = Array.isArray(c.cliente)     ? c.cliente[0]     : c.cliente;
    const con = Array.isArray(c.constructor) ? c.constructor[0] : c.constructor;
    const ofe = Array.isArray(c.oferta)      ? c.oferta[0]      : c.oferta;

    return {
      id:                   c.id,
      precio_final:         c.precio_final,
      garantia_anos:        c.garantia_anos        ?? null,
      estado:               c.estado,
      generado_en:          c.generado_en          ?? '',
      firmado_en:           c.firmado_en           ?? null,
      url_pdf:              c.url_pdf              ?? null,
      descripcion_trabajo:  c.descripcion_trabajo  ?? '',
      expediente_id:        exp?.id                ?? '',
      expediente_numero:    exp?.numero            ?? '—',
      expediente_estado:    exp?.estado            ?? '',
      servicio_nombre:      svc?.nombre_es         ?? '—',
      servicio_nombre_en:   svc?.nombre_en ?? svc?.nombre_es ?? '—',
      servicio_nombre_fr:   svc?.nombre_fr ?? svc?.nombre_es ?? '—',
      servicio_desc:        svc?.descripcion_es    ?? '',
      servicio_desc_en:     svc?.descripcion_en    ?? '',
      servicio_desc_fr:     svc?.descripcion_fr    ?? '',
      direccion:            loc?.direccion         ?? '—',
      provincia:            loc?.provincia         ?? '—',
      canton:               loc?.canton            ?? '—',
      distrito:             loc?.distrito          ?? null,
      cliente_nombre:       cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
      cliente_telefono:     cli?.telefono          ?? '—',
      cliente_email:        cli?.email             ?? '—',
      constructor_id:       constructorId,
      constructor_nombre:   con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || '—' : '—',
      constructor_telefono: con?.telefono          ?? '—',
      constructor_email:    con?.email             ?? '—',
      estimador_nombre:     null,
      estimador_telefono:   null,
      estimador_email:      null,
      oferta_id:            ofe?.id                ?? '',
      servicios:            await this.serviciosDelContrato(c.servicio_ids, svc),
      oferta_fecha_inicio:  ofe?.fecha_inicio      ?? null,
      plazo_semanas_min:    ofe?.plazo_semanas_min ?? null,
      plazo_semanas_max:    ofe?.plazo_semanas_max ?? null,
    };
  }

  // ── Constructor: listar contratos propios ───────────────────────────────

  async getContratosConstructor(constructorId: string): Promise<ContratoConstructorListItem[]> {
    const rows  = await this.contratoRepo.findByConstructorId(constructorId);
    const items = rows.map((c: any) => this.mapContratoListItem(c));
    await Promise.all([this.adjuntarFotos(items), this.adjuntarServicios(items, rows)]);
    return items;
  }

  // ── Estimador: contratos de los expedientes que estimó ───────────────────

  async getContratosEstimador(estimadorId: string): Promise<ContratoConstructorListItem[]> {
    const rows  = await this.contratoRepo.findByEstimadorId(estimadorId);
    const items = rows.map((c: any) => this.mapContratoListItem(c));
    await Promise.all([this.adjuntarFotos(items), this.adjuntarServicios(items, rows)]);
    return items;
  }

  // ── Administrador: todos los contratos con seguimiento de obra ────────────

  async getContratosMonitoringAdmin(): Promise<ContratoConstructorListItem[]> {
    const rows  = await this.contratoRepo.findAllForMonitoring();
    const items = rows.map((c: any) => this.mapContratoListItem(c));
    await Promise.all([this.adjuntarFotos(items), this.adjuntarServicios(items, rows)]);
    return items;
  }

  /**
   * Rellena `servicios` de cada contrato de una lista, con una sola consulta
   * al catálogo. `rows` son las filas crudas, en el mismo orden que `items`.
   */
  private async adjuntarServicios(items: { servicios?: ServicioContrato[] }[], rows: any[]): Promise<void> {
    const catalogo = await this.catalogoServicios(
      rows.flatMap((c: any) => (c.servicio_ids ?? []) as number[]),
    );
    items.forEach((it, i) => {
      it.servicios = this.serviciosDe(rows[i].servicio_ids, catalogo, rows[i].expediente?.servicio ?? null);
    });
  }

  // Rellena `foto` con la miniatura del tour 3D (Matterport) de cada expediente.
  private async adjuntarFotos(items: ContratoConstructorListItem[]): Promise<void> {
    const expedienteIds = [...new Set(items.map(i => i.expediente_id).filter(Boolean))];
    if (!expedienteIds.length) return;

    const estimaciones = await this.estimacionRepo.findFechasByExpedienteIds(expedienteIds);
    const fotoPorExpediente = new Map<string, string>();
    for (const est of estimaciones) {
      const thumb = matterportThumbFromTour(est.url_tour);
      if (thumb) fotoPorExpediente.set(est.expediente_id, thumb);
    }
    for (const it of items) {
      const f = it.expediente_id ? fotoPorExpediente.get(it.expediente_id) : null;
      if (f) it.foto = f;
    }
  }

  /**
   * La obra llegó al 100 % (la base marca el seguimiento como `completado`)
   * pero el contrato sigue abierto: el administrador aún tiene que completarlo.
   * Solo sabe responder si la fila trae `seguimiento`.
   */
  private obraTerminada(c: any): boolean {
    const seg = Array.isArray(c.seguimiento) ? c.seguimiento[0] : c.seguimiento;
    return seg?.estado === 'completado' && c.estado !== 'completado' && c.estado !== 'cancelado';
  }

  // Mapea una fila de contrato (con joins expediente/servicio/loc/cliente/oferta)
  // al item de lista de seguimiento. Compartido por constructor y estimador.
  private mapContratoListItem(c: any): ContratoConstructorListItem {
    const svc    = c.expediente?.servicio;
    const locArr = c.expediente?.localizacion;
    const loc    = Array.isArray(locArr) ? locArr[0] : locArr;
    const cli    = c.cliente;
    const con    = c.constructor;
    const ofe    = Array.isArray(c.oferta) ? c.oferta[0] : c.oferta;
    return {
      id:                 c.id,
      expediente_id:      c.expediente_id       ?? '',
      expediente_numero:  c.expediente?.numero  ?? '—',
      servicio_nombre:    svc?.nombre_es        ?? '—',
      servicio_nombre_en: svc?.nombre_en ?? svc?.nombre_es ?? '—',
      servicio_nombre_fr: svc?.nombre_fr ?? svc?.nombre_es ?? '—',
      cliente_nombre:     cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
      constructor_nombre:   con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || '—' : '—',
      constructor_telefono: con?.telefono ?? '—',
      constructor_email:    con?.email    ?? '—',
      precio_final:       c.precio_final,
      garantia_anos:      c.garantia_anos       ?? null,
      estado:             c.estado,
      obra_terminada:     this.obraTerminada(c),
      generado_en:        c.generado_en         ?? '',
      firmado_en:         c.firmado_en          ?? null,
      actualizado_en:     c.actualizado_en      ?? '',
      url_pdf:            c.url_pdf             ?? null,
      fecha_inicio:       ofe?.fecha_inicio     ?? null,
      plazo_semanas_min:  ofe?.plazo_semanas_min ?? null,
      plazo_semanas_max:  ofe?.plazo_semanas_max ?? null,
      // Vacío, no '—': el guion es cosa de la plantilla, y así el bloque de
      // dirección puede ocultarse cuando no hay datos en vez de pintar guiones.
      direccion:          loc?.direccion        ?? '',
      provincia:          loc?.provincia        ?? '',
      canton:             loc?.canton           ?? '',
      distrito:           loc?.distrito         ?? '',
      foto:               null,
    } as ContratoConstructorListItem;
  }

  // ── Admin: listar contratos ──────────────────────────────────────────────

  async getContratosAdmin(): Promise<ContratoAdminListItem[]> {
    const rows = await this.contratoRepo.findAllAdmin();

    const estimadorIds = [...new Set(
      rows
        .map((c: any) => {
          const exp = Array.isArray(c.expediente) ? c.expediente[0] : c.expediente;
          return exp?.estimador_id as string | null | undefined;
        })
        .filter((id): id is string => !!id),
    )];

    const expedienteIds = [...new Set(
      rows
        .map((c: any) => {
          const exp = Array.isArray(c.expediente) ? c.expediente[0] : c.expediente;
          return exp?.id as string | undefined;
        })
        .filter((id): id is string => !!id),
    )];

    // Servicios de todos los contratos de la lista, en una sola consulta.
    const servicioIds = rows.flatMap((c: any) => (c.servicio_ids ?? []) as number[]);

    const [perfiles, estimaciones, catalogo] = await Promise.all([
      this.contratoRepo.findPerfilesByIds(estimadorIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
      this.catalogoServicios(servicioIds),
    ]);

    const estimadoresMap: Record<string, string> = {};
    for (const p of perfiles) {
      estimadoresMap[p.id] = `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
    }

    // Miniatura del tour 3D (Matterport) por expediente.
    const fotoPorExpediente = new Map<string, string>();
    for (const est of estimaciones) {
      const thumb = matterportThumbFromTour(est.url_tour);
      if (thumb) fotoPorExpediente.set(est.expediente_id, thumb);
    }

    return rows.map((c: any) => {
      const exp = Array.isArray(c.expediente) ? c.expediente[0] : c.expediente;
      const svc = exp?.servicio ? (Array.isArray(exp.servicio) ? exp.servicio[0] : exp.servicio) : null;
      const loc = exp?.localizacion ? (Array.isArray(exp.localizacion) ? exp.localizacion[0] : exp.localizacion) : null;
      const cli = Array.isArray(c.cliente)     ? c.cliente[0]     : c.cliente;
      const con = Array.isArray(c.constructor) ? c.constructor[0] : c.constructor;
      const ofe = Array.isArray(c.oferta)      ? c.oferta[0]      : c.oferta;
      return {
        contrato_id:         c.id,
        precio_final:        c.precio_final,
        garantia_anos:       c.garantia_anos       ?? null,
        contrato_estado:     c.estado,
        generado_en:         c.generado_en         ?? '',
        firmado_en:          c.firmado_en          ?? null,
        expediente_id:       exp?.id               ?? '',
        expediente_numero:   exp?.numero           ?? '—',
        expediente_estado:   exp?.estado           ?? '',
        servicio_nombre:     svc?.nombre_es        ?? '—',
        servicio_nombre_en:  svc?.nombre_en ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr:  svc?.nombre_fr ?? svc?.nombre_es ?? '—',
        servicios:           this.serviciosDe(c.servicio_ids, catalogo, svc),
        obra_terminada:      this.obraTerminada(c),
        cliente_nombre:      cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
        estimador_nombre:    exp?.estimador_id ? (estimadoresMap[exp.estimador_id] ?? null) : null,
        constructor_nombre:  con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || null : null,
        oferta_fecha_inicio: ofe?.fecha_inicio     ?? null,
        foto:                (exp?.id ? fotoPorExpediente.get(exp.id) : null) ?? null,
        direccion:           loc?.direccion        ?? '',
        provincia:           loc?.provincia        ?? '',
        canton:              loc?.canton           ?? '',
        distrito:            loc?.distrito         ?? '',
      } as ContratoAdminListItem;
    });
  }

  // ── PDF generation ────────────────────────────────────────────────────────

  generarPdfBlob(d: ContratoPdfData): Blob {
    return generarContratoPdfBlob(d);
  }
}
