import { Injectable, inject } from '@angular/core';
import { ContratoAdminDetalle, ContratoAdminListItem, ContratoConstructorListItem, ContratoInput, ContratoPdfData, ContratoListItem } from '../models';
import { ContratoRepository } from '../data/contrato.repository';
import { OfertaRepository } from '../data/oferta.repository';
import { EstimacionRepository } from '../data/estimacion.repository';
import { generarContratoPdfBlob } from '../shared/contrato-pdf';
import { matterportThumbFromTour } from '../shared/util/matterport';

@Injectable({ providedIn: 'root' })
export class ContratoService {
  private contratoRepo = inject(ContratoRepository);
  private ofertaRepo   = inject(OfertaRepository);
  private estimacionRepo = inject(EstimacionRepository);

  // ── Listar contratos del cliente ─────────────────────────────────────────

  async getMisContratos(clienteId: string): Promise<ContratoListItem[]> {
    const rows = await this.contratoRepo.findByClienteId(clienteId);
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
      } as ContratoListItem;
    });
  }

  // ── Buscar contrato existente por expediente ─────────────────────────────

  async buscarPorExpediente(expedienteId: string): Promise<{ id: string; url_pdf: string | null } | null> {
    return this.contratoRepo.findSimpleByExpedienteId(expedienteId);
  }

  async eliminarContrato(contratoId: string, pdfPath: string | null): Promise<void> {
    if (pdfPath) await this.contratoRepo.removePdfFromStorage(pdfPath);
    await this.contratoRepo.deleteById(contratoId);
  }

  async eliminarPdfStorage(pdfPath: string): Promise<void> {
    return this.contratoRepo.removePdfFromStorage(pdfPath);
  }

  async cancelarContrato(expedienteId: string): Promise<void> {
    return this.contratoRepo.cancelar(expedienteId);
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
      oferta_fecha_inicio:  ofe?.fecha_inicio      ?? null,
      plazo_semanas_min:    ofe?.plazo_semanas_min ?? null,
      plazo_semanas_max:    ofe?.plazo_semanas_max ?? null,
    };
  }

  // ── Constructor: listar contratos propios ───────────────────────────────

  async getContratosConstructor(constructorId: string): Promise<ContratoConstructorListItem[]> {
    const rows = await this.contratoRepo.findByConstructorId(constructorId);
    return rows.map((c: any) => this.mapContratoListItem(c));
  }

  // ── Estimador: contratos de los expedientes que estimó ───────────────────

  async getContratosEstimador(estimadorId: string): Promise<ContratoConstructorListItem[]> {
    const rows = await this.contratoRepo.findByEstimadorId(estimadorId);
    return rows.map((c: any) => this.mapContratoListItem(c));
  }

  // ── Administrador: todos los contratos con seguimiento de obra ────────────

  async getContratosMonitoringAdmin(): Promise<ContratoConstructorListItem[]> {
    const rows  = await this.contratoRepo.findAllForMonitoring();
    const items = rows.map((c: any) => this.mapContratoListItem(c));

    // Miniatura del tour 3D (Matterport) por expediente.
    const expedienteIds = [...new Set(items.map(i => i.expediente_id).filter(Boolean))];
    if (expedienteIds.length) {
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
    return items;
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
      generado_en:        c.generado_en         ?? '',
      firmado_en:         c.firmado_en          ?? null,
      actualizado_en:     c.actualizado_en      ?? '',
      url_pdf:            c.url_pdf             ?? null,
      fecha_inicio:       ofe?.fecha_inicio     ?? null,
      plazo_semanas_min:  ofe?.plazo_semanas_min ?? null,
      plazo_semanas_max:  ofe?.plazo_semanas_max ?? null,
      direccion:          loc?.direccion        ?? '—',
      provincia:          loc?.provincia        ?? '—',
      canton:             loc?.canton           ?? '—',
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

    const [perfiles, estimaciones] = await Promise.all([
      this.contratoRepo.findPerfilesByIds(estimadorIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
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
        cliente_nombre:      cli ? `${cli.nombre ?? ''} ${cli.apellido ?? ''}`.trim() || '—' : '—',
        estimador_nombre:    exp?.estimador_id ? (estimadoresMap[exp.estimador_id] ?? null) : null,
        constructor_nombre:  con ? `${con.nombre ?? ''} ${con.apellido ?? ''}`.trim() || null : null,
        oferta_fecha_inicio: ofe?.fecha_inicio     ?? null,
        foto:                (exp?.id ? fotoPorExpediente.get(exp.id) : null) ?? null,
      } as ContratoAdminListItem;
    });
  }

  // ── PDF generation ────────────────────────────────────────────────────────

  generarPdfBlob(d: ContratoPdfData): Blob {
    return generarContratoPdfBlob(d);
  }
}
