import { Injectable, inject } from '@angular/core';
import {
  ExpedienteAdmin,
  ExpedienteCliente,
  ExpedienteConOfertas,
  OfertaResumen,
  ExpedienteConOfertaAdmin,
  ExpedienteDetalleCliente,
  ExpedienteParaEdicion,
  ExpedienteParaEstimar,
  ExpedienteRow,
  ExpedienteDetalle,
  ExpedienteDisponible,
  ExpedienteParaOferta,
  ExpedienteVistaCliente,
} from '../models';
import { EstadoExpediente, TipoInmueble } from '../types/supabase';
import {
  ExpedienteRepository,
  LocalizacionRepository,
  ExpedienteServicioRepository,
  PerfilRepository,
  ServicioRepository,
  EstimacionRepository,
  OfertaRepository,
} from '../data';
import { OfertaRaw, OfertaHistorialItem } from '../data/oferta.repository';
import { ServicioCompleto } from '../data/servicio.repository';
import { matterportThumbFromTour } from '../shared/util/matterport';
export type { OfertaHistorialItem } from '../data/oferta.repository';

@Injectable({ providedIn: 'root' })
export class ExpedienteService {
  private expedienteRepo  = inject(ExpedienteRepository);
  private localizacionRepo = inject(LocalizacionRepository);
  private expServicioRepo  = inject(ExpedienteServicioRepository);
  private perfilRepo      = inject(PerfilRepository);
  private servicioRepo    = inject(ServicioRepository);
  private estimacionRepo  = inject(EstimacionRepository);
  private ofertaRepo      = inject(OfertaRepository);

  // ── Módulo cliente ────────────────────────────────────────────────────────

  async getMisExpedientes(clienteId: string): Promise<ExpedienteCliente[]> {
    const exps = await this.expedienteRepo.findByClienteId(clienteId);
    if (!exps.length) return [];

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);
    const [servicios, estimaciones] = await Promise.all([
      this.servicioRepo.findByIds(servicioIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
    ]);

    return exps.map(e => {
      const svc = servicios.find(s => s.id === e.servicio_id) ?? null;
      const est = estimaciones.find(x => x.expediente_id === e.id);
      return {
        id:           e.id,
        numero:       e.numero,
        estado:       e.estado,
        fecha_visita: e.fecha_visita,
        creado_en:    e.creado_en,
        descripcion:  e.descripcion,
        servicio:     svc ? { nombre_fr: svc.nombre_fr ?? '', nombre_en: svc.nombre_en ?? '', nombre_es: svc.nombre_es } : null,
        url_tour:     est?.url_tour ?? null,
      } as ExpedienteCliente;
    });
  }

  async getDetalleParaCliente(expedienteId: string): Promise<ExpedienteDetalleCliente> {
    const exp = await this.expedienteRepo.findById(expedienteId);

    const [servicio, loc, perfil] = await Promise.all([
      this.servicioRepo.findById(exp.servicio_id),
      this.localizacionRepo.findByExpedienteId(expedienteId),
      this.perfilRepo.findById(exp.cliente_id),
    ]);

    return {
      id:              exp.id,
      numero:          exp.numero,
      estado:          exp.estado,
      fecha_visita:    exp.fecha_visita,
      creado_en:       exp.creado_en,
      servicio_nombre:         servicio?.nombre_es         ?? '—',
      servicio_nombre_en:      servicio?.nombre_en         ?? servicio?.nombre_es ?? '—',
      servicio_nombre_fr:      servicio?.nombre_fr         ?? servicio?.nombre_es ?? '—',
      servicio_descripcion:    servicio?.descripcion_es    ?? '',
      servicio_descripcion_en: servicio?.descripcion_en    ?? servicio?.descripcion_es ?? '',
      servicio_descripcion_fr: servicio?.descripcion_fr    ?? servicio?.descripcion_es ?? '',
      cliente_nombre:  perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
      direccion:       loc?.direccion  ?? '—',
      referencia:      loc?.referencia ?? '',
      provincia:       loc?.provincia  ?? '—',
      canton:          loc?.canton     ?? '—',
      distrito:        loc?.distrito   ?? '—',
    };
  }

  async getVistaParaCliente(expedienteId: string): Promise<ExpedienteVistaCliente> {
    const exp = await this.expedienteRepo.findById(expedienteId);
    if (!exp) throw new Error('file.not_found');

    const [servicio, loc, cliente, estimacion] = await Promise.all([
      this.servicioRepo.findById(exp.servicio_id),
      this.localizacionRepo.findByExpedienteId(expedienteId),
      this.perfilRepo.findById(exp.cliente_id),
      this.estimacionRepo.findByExpedienteId(expedienteId),
    ]);

    let estimadorNombre: string | null = null;
    if (exp.estimador_id) {
      const est = await this.perfilRepo.findById(exp.estimador_id);
      if (est) estimadorNombre = `${est.nombre} ${est.apellido}`;
    }

    return {
      id:              exp.id,
      numero:          exp.numero,
      estado:          exp.estado,
      fecha_visita:    exp.fecha_visita,
      creado_en:       exp.creado_en,
      servicio_nombre:    servicio?.nombre_es ?? '—',
      servicio_nombre_en: servicio?.nombre_en ?? servicio?.nombre_es ?? '—',
      servicio_nombre_fr: servicio?.nombre_fr ?? servicio?.nombre_es ?? '—',
      cliente_nombre:  cliente ? `${cliente.nombre} ${cliente.apellido}` : '—',
      direccion:       loc?.direccion  ?? '—',
      referencia:      loc?.referencia ?? '',
      provincia:       loc?.provincia  ?? '—',
      canton:          loc?.canton     ?? '—',
      distrito:        loc?.distrito   ?? '—',
      estimador_nombre:      estimadorNombre,
      fecha_visita_real:     estimacion?.fecha_visita_real     ?? null,
      descripcion_problemas: estimacion?.descripcion_problemas ?? null,
      costo_estimado:        estimacion?.costo_estimado        ?? null,
      costo_estimado_max:    estimacion?.costo_estimado_max    ?? null,
      url_tour:              estimacion?.url_tour              ?? null,
    };
  }

  async getExpedientesConOfertas(clienteId: string): Promise<ExpedienteConOfertas[]> {
    const estados: EstadoExpediente[] = ['en_oferta', 'adjudicado', 'contratado'];
    const exps = await this.expedienteRepo.findByClienteIdInEstados(clienteId, estados);
    if (!exps.length) return [];

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);

    const [servicios, locs, ofertasRaw, estimaciones] = await Promise.all([
      this.servicioRepo.findByIdsCompleto(servicioIds),
      this.localizacionRepo.findByExpedienteIds(expedienteIds),
      this.ofertaRepo.findByExpedienteIds(expedienteIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
    ]);

    const constructorIds = [...new Set(ofertasRaw.map(o => o.constructor_id))];
    const constructores  = constructorIds.length
      ? await this.perfilRepo.findByIds(constructorIds)
      : [];

    return exps.map(e => {
      const svc = servicios.find(s => s.id === e.servicio_id);
      const loc = locs.find(l => l.expediente_id === e.id);

      const ofertas: OfertaResumen[] = ofertasRaw
        .filter(o => o.expediente_id === e.id)
        .sort((a, b) => a.precio - b.precio)
        .map(o => {
          const cons = constructores.find(c => c.id === o.constructor_id);
          return {
            id:                 o.id,
            constructor_nombre: cons ? `${cons.nombre} ${cons.apellido}`.trim() : '—',
            precio:             o.precio,
            estado:             o.estado,
            plazo_semanas_min:  o.plazo_semanas_min,
            plazo_semanas_max:  o.plazo_semanas_max,
          };
        });

      return {
        id:              e.id,
        numero:          e.numero,
        estado:          e.estado,
        fecha_visita:    e.fecha_visita,
        servicio_nombre:         svc?.nombre_es         ?? '—',
        servicio_nombre_en:      svc?.nombre_en         ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr:      svc?.nombre_fr         ?? svc?.nombre_es ?? '—',
        servicio_descripcion:    svc?.descripcion_es    ?? '',
        servicio_descripcion_en: svc?.descripcion_en    ?? svc?.descripcion_es ?? '',
        servicio_descripcion_fr: svc?.descripcion_fr    ?? svc?.descripcion_es ?? '',
        direccion:  loc?.direccion  ?? '—',
        referencia: loc?.referencia ?? '',
        provincia:  loc?.provincia  ?? '—',
        canton:     loc?.canton     ?? '—',
        distrito:   loc?.distrito   ?? '—',
        total_ofertas: ofertas.length,
        ofertas,
        url_tour: estimaciones.find(x => x.expediente_id === e.id)?.url_tour ?? null,
      } as ExpedienteConOfertas;
    });
  }

  async crear(payload: {
    clienteId:   string;
    /** Servicio principal: el que leen estimación, seguimiento y listados. */
    servicioId:  number;
    /**
     * Lista completa cuando el expediente tiene varios servicios (altas de
     * administrador, estimador y cliente). Puede incluir el principal o no: el trigger de
     * `expediente_servicio` ya lo inserta y aquí se descarta.
     */
    servicioIds?: number[];
    numero:      string;
    fechaVisita: string;
    descripcion?: string | null;
    /**
     * Estimador asignado desde el alta. Solo lo envía `estimator/file/create`,
     * para que el expediente nazca ya en su bandeja. Ojo: es asignación, no
     * autoría — `asignarEstimador()` lo reescribe y `liberar()` lo vacía.
     */
    estimadorId?: string | null;
    /**
     * Autor del alta (`expediente.creado_por`). Inmutable: sobrevive a las
     * reasignaciones, y es lo que garantiza que el expediente siga apareciendo
     * en la lista de quien lo creó. Si no se envía, la base lo sella igual con
     * `auth.uid()`.
     */
    creadoPor?: string | null;
    localizacion: {
      tipo_inmueble: TipoInmueble;
      direccion:  string;
      provincia:  string;
      canton:     string;
      distrito:   string;
      referencia?: string | null;
      latitud?:    number | null;
      longitud?:   number | null;
    };
  }): Promise<string> {
    const id = await this.expedienteRepo.insert({
      numero:       payload.numero,
      cliente_id:   payload.clienteId,
      servicio_id:  payload.servicioId,
      estado:       'nuevo',
      fecha_visita: payload.fechaVisita,
      descripcion:  payload.descripcion ?? null,
      estimador_id: payload.estimadorId ?? null,
      // Sólo se manda si se conoce: un NULL explícito anularía el DEFAULT
      // `auth.uid()` de la columna y el expediente quedaría sin autor.
      ...(payload.creadoPor ? { creado_por: payload.creadoPor } : {}),
    });

    await this.localizacionRepo.insert({
      expediente_id: id,
      ...payload.localizacion,
      referencia: payload.localizacion.referencia ?? null,
      latitud:    payload.localizacion.latitud    ?? null,
      longitud:   payload.localizacion.longitud   ?? null,
    });

    const adicionales = [...new Set(payload.servicioIds ?? [])]
      .filter(sid => sid !== payload.servicioId);
    await this.expServicioRepo.insertMany(id, adicionales);
    return id;
  }

  async contarExpedientesCliente(clienteId: string): Promise<{ primeroId: string | null; hayMasDeUno: boolean }> {
    return this.expedienteRepo.countByClienteId(clienteId);
  }

  // ── Módulo estimador — listas ─────────────────────────────────────────────

  async getExpedienteRows(options: {
    estado?:      EstadoExpediente;
    estados?:     EstadoExpediente[];
    estimadorId?: string;
  }): Promise<ExpedienteRow[]> {
    return this.componerFilas(await this.expedienteRepo.findByFiltro(options));
  }

  /**
   * Todos los expedientes del estimador, en cualquier estado: los que creó
   * (`expediente.creado_por`, inmutable), los que tiene asignados
   * (`expediente.estimador_id`) y los que estimó (`estimacion.estimador_id`,
   * que sobrevive a una reasignación).
   */
  async getExpedientesDeEstimador(estimadorId: string): Promise<ExpedienteRow[]> {
    return this.componerFilas(await this.expedienteRepo.findDeEstimador(estimadorId));
  }

  /** Enriquece las filas crudas con cliente, servicio, dirección y miniatura. */
  private async componerFilas(exps: { id: string; numero: string; fecha_visita: string; estado: string; cliente_id: string; servicio_id: number; creado_por?: string | null }[]): Promise<ExpedienteRow[]> {
    if (!exps.length) return [];

    const clienteIds    = [...new Set(exps.map(e => e.cliente_id))];
    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);

    const [perfiles, servicios, locs, estimaciones] = await Promise.all([
      this.perfilRepo.findByIds(clienteIds),
      this.servicioRepo.findByIds(servicioIds),
      this.localizacionRepo.findByExpedienteIds(expedienteIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
    ]);

    return exps.map(e => {
      const perfil   = perfiles.find(p => p.id === e.cliente_id);
      const servicio = servicios.find(s => s.id === e.servicio_id);
      const loc      = locs.find(l => l.expediente_id === e.id);
      const est      = estimaciones.find(x => x.expediente_id === e.id);
      return {
        id:                 e.id,
        numero:             e.numero,
        fecha_visita:       e.fecha_visita,
        estado:             e.estado,
        servicio_nombre:    servicio?.nombre_es ?? '—',
        servicio_nombre_en: servicio?.nombre_en ?? servicio?.nombre_es ?? '—',
        servicio_nombre_fr: servicio?.nombre_fr ?? servicio?.nombre_es ?? '—',
        cliente_nombre:     perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
        direccion:          loc?.direccion ?? '—',
        provincia:          loc?.provincia ?? '—',
        canton:             loc?.canton    ?? '—',
        distrito:           loc?.distrito  ?? '—',
        foto:               matterportThumbFromTour(est?.url_tour),
        creado_por:         e.creado_por ?? null,
      } as ExpedienteRow;
    });
  }

  // ── Módulo estimador — detalle ────────────────────────────────────────────

  async getDetalle(id: string): Promise<ExpedienteDetalle> {
    const exp = await this.expedienteRepo.findById(id);
    if (!exp) throw new Error('file.not_found');

    const [servicio, perfil, loc, estimadorPerfil] = await Promise.all([
      this.servicioRepo.findById(exp.servicio_id),
      this.perfilRepo.findByIdWithContact(exp.cliente_id),
      this.localizacionRepo.findByExpedienteId(id),
      exp.estimador_id
        ? this.perfilRepo.findById(exp.estimador_id)
        : Promise.resolve(null),
    ]);

    return {
      numero:           exp.numero,
      estado:           exp.estado,
      fecha_visita:     exp.fecha_visita,
      descripcion:      exp.descripcion ?? '',
      servicio_nombre:    servicio?.nombre_es ?? '—',
      servicio_nombre_en: servicio?.nombre_en ?? servicio?.nombre_es ?? '—',
      servicio_nombre_fr: servicio?.nombre_fr ?? servicio?.nombre_es ?? '—',
      cliente_id:         exp.cliente_id,
      cliente_nombre:     perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
      cliente_telefono:   perfil?.telefono ?? '',
      direccion:  loc?.direccion  ?? '—',
      referencia: loc?.referencia ?? '—',
      provincia:  loc?.provincia  ?? '—',
      canton:     loc?.canton     ?? '—',
      distrito:   loc?.distrito   ?? '—',
      estimador_id:     exp.estimador_id ?? null,
      estimador_nombre: estimadorPerfil
        ? `${estimadorPerfil.nombre} ${estimadorPerfil.apellido}`
        : '—',
    };
  }

  // ── Módulo constructor ────────────────────────────────────────────────────

  async getExpedientesDisponibles(): Promise<ExpedienteDisponible[]> {
    const exps = await this.expedienteRepo.findDisponibles();
    if (!exps.length) return [];

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);

    const [servicios, locs, estimaciones, ofertasCounts] = await Promise.all([
      this.servicioRepo.findByIds(servicioIds),
      this.localizacionRepo.findByExpedienteIds(expedienteIds),
      this.estimacionRepo.findMinByExpedienteIds(expedienteIds),
      this.expedienteRepo.countOfertasPorExpediente(expedienteIds),
    ]);

    return exps.map(e => {
      const svc        = servicios.find(s => s.id === e.servicio_id);
      const loc        = locs.find(l => l.expediente_id === e.id);
      const estimacion = estimaciones.find(est => est.expediente_id === e.id);
      const total      = ofertasCounts.find(c => c.expediente_id === e.id)?.total ?? 0;
      return {
        id:                 e.id,
        numero:             e.numero,
        estado:             e.estado,
        creado_en:          e.creado_en ?? '',
        servicio_nombre:    svc?.nombre_es ?? '—',
        servicio_nombre_en: svc?.nombre_en ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr: svc?.nombre_fr ?? svc?.nombre_es ?? '—',
        direccion:          loc?.direccion ?? '—',
        provincia:          loc?.provincia ?? '—',
        canton:             loc?.canton    ?? '—',
        distrito:           loc?.distrito  ?? '—',
        costo_estimado:     estimacion?.costo_estimado     ?? null,
        costo_estimado_max: estimacion?.costo_estimado_max ?? null,
        total_ofertas:      total,
        foto:               matterportThumbFromTour(estimacion?.url_tour),
      } as ExpedienteDisponible;
    }).filter(r =>
      r.estado === 'estimado' || (r.estado === 'en_oferta' && r.total_ofertas < 5)
    );
  }

  async getExpedienteParaOferta(id: string): Promise<ExpedienteParaOferta> {
    const exp = await this.expedienteRepo.findById(id);
    if (!exp) throw new Error('file.not_found');

    const [servicio, loc, estimacion, totalOfertas, cliente] = await Promise.all([
      this.servicioRepo.findById(exp.servicio_id),
      this.localizacionRepo.findByExpedienteId(id),
      this.estimacionRepo.findByExpedienteId(id),
      this.ofertaRepo.countByExpedienteId(id),
      this.perfilRepo.findById(exp.cliente_id),
    ]);

    return {
      id,
      numero:                  exp.numero,
      estado:                  exp.estado,
      cliente_nombre:          cliente ? `${cliente.nombre} ${cliente.apellido}`.trim() : '—',
      fecha_visita:            exp.fecha_visita,
      servicio_nombre:         servicio?.nombre_es         ?? '—',
      servicio_nombre_en:      servicio?.nombre_en         ?? servicio?.nombre_es ?? '—',
      servicio_nombre_fr:      servicio?.nombre_fr         ?? servicio?.nombre_es ?? '—',
      servicio_descripcion:    servicio?.descripcion_es    ?? '',
      servicio_descripcion_en: servicio?.descripcion_en    ?? servicio?.descripcion_es ?? '',
      servicio_descripcion_fr: servicio?.descripcion_fr    ?? servicio?.descripcion_es ?? '',
      direccion:            loc?.direccion  ?? '—',
      referencia:           loc?.referencia ?? '—',
      provincia:            loc?.provincia  ?? '—',
      canton:               loc?.canton     ?? '—',
      distrito:             loc?.distrito   ?? '—',
      descripcion_problemas: estimacion?.descripcion_problemas ?? '',
      costo_estimado:        estimacion?.costo_estimado        ?? null,
      costo_estimado_max:    estimacion?.costo_estimado_max    ?? null,
      fecha_visita_real:     estimacion?.fecha_visita_real     ?? '',
      url_tour:              estimacion?.url_tour              ?? null,
      total_ofertas:         totalOfertas,
    };
  }

  // ── Módulo administrador ─────────────────────────────────────────────────

  async getExpedientesParaEstimar(): Promise<ExpedienteParaEstimar[]> {
    const estados: EstadoExpediente[] = ['nuevo', 'en_estimacion', 'estimado'];
    const exps = await this.expedienteRepo.findByFiltro({ estados });
    if (!exps.length) return [];

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);
    const userIds       = [...new Set([
      ...exps.map(e => e.cliente_id),
      ...exps.filter(e => e.estimador_id).map(e => e.estimador_id as string),
    ])];

    const [servicios, perfiles, estimaciones, localizaciones] = await Promise.all([
      this.servicioRepo.findByIds(servicioIds),
      this.perfilRepo.findByIds(userIds),
      this.estimacionRepo.findSummaryByExpedienteIds(expedienteIds),
      this.localizacionRepo.findByExpedienteIds(expedienteIds),
    ]);

    return exps.map(e => {
      const svc       = servicios.find(s => s.id === e.servicio_id);
      const cliente   = perfiles.find(p => p.id === e.cliente_id);
      const estimador = e.estimador_id ? perfiles.find(p => p.id === e.estimador_id) : null;
      const est       = estimaciones.find(est => est.expediente_id === e.id);
      const loc       = localizaciones.find(l => l.expediente_id === e.id) ?? null;
      return {
        id:                  e.id,
        numero:              e.numero,
        estado:              e.estado,
        fecha_visita:        e.fecha_visita,
        creado_en:           e.creado_en,
        servicio_nombre:     svc?.nombre_es         ?? '—',
        servicio_nombre_en:  svc?.nombre_en         ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr:  svc?.nombre_fr         ?? svc?.nombre_es ?? '—',
        cliente_nombre:      cliente   ? `${cliente.nombre}   ${cliente.apellido}`.trim()   : '—',
        estimador_nombre:    estimador ? `${estimador.nombre} ${estimador.apellido}`.trim() : null,
        fecha_visita_real:   est?.fecha_visita_real  ?? null,
        costo_estimado:      est?.costo_estimado     ?? null,
        costo_estimado_max:  est?.costo_estimado_max ?? null,
        url_tour:            est?.url_tour           ?? null,
        direccion:           loc?.direccion          ?? '',
        provincia:           loc?.provincia          ?? '',
        canton:              loc?.canton             ?? '',
        distrito:            loc?.distrito           ?? '',
      } as ExpedienteParaEstimar;
    });
  }

  async getExpedientesAdmin(options: {
    page:      number;
    pageSize:  number;
    estado?:   string;
    busqueda?: string;
  }): Promise<{ items: ExpedienteAdmin[]; total: number }> {
    const { data: exps, count } = await this.expedienteRepo.findAllPaginated(options);
    if (!exps.length) return { items: [], total: count };

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id).filter(Boolean))];
    const expedienteIds = exps.map(e => e.id);
    const userIds       = [...new Set([
      ...exps.map(e => e.cliente_id),
      ...exps.map(e => e.estimador_id),
    ].filter((id): id is string => !!id))];

    const [servicios, perfiles, estimaciones, ofertas] = await Promise.all([
      this.servicioRepo.findByIds(servicioIds),
      this.perfilRepo.findByIds(userIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
      this.ofertaRepo.findAceptadasByExpedienteIds(expedienteIds),
    ]);

    const items = exps.map(e => {
      const svc       = servicios.find(s => s.id === e.servicio_id);
      const cliente   = perfiles.find(p => p.id === e.cliente_id);
      const estimador = e.estimador_id ? perfiles.find(p => p.id === e.estimador_id) : null;
      const est       = estimaciones.find(est => est.expediente_id === e.id);
      const oferta    = ofertas.find(o => o.expediente_id === e.id);
      return {
        id:                  e.id,
        numero:              e.numero,
        estado:              e.estado,
        fecha_visita:        e.fecha_visita,
        servicio_nombre:     svc?.nombre_es       ?? '—',
        servicio_nombre_en:  svc?.nombre_en       ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr:  svc?.nombre_fr       ?? svc?.nombre_es ?? '—',
        cliente_nombre:      cliente ? `${cliente.nombre} ${cliente.apellido}`.trim() : '—',
        estimador_nombre:    estimador ? `${estimador.nombre} ${estimador.apellido}`.trim() : null,
        direccion:           e.direccion ?? '',
        provincia:           e.provincia ?? '',
        canton:              e.canton    ?? '',
        distrito:            e.distrito  ?? '',
        fecha_visita_real:   est?.fecha_visita_real    ?? null,
        oferta_precio:       oferta?.precio            ?? null,
        oferta_fecha_inicio: oferta?.fecha_inicio      ?? null,
        url_tour:            est?.url_tour             ?? null,
      } as ExpedienteAdmin;
    });

    return { items, total: count };
  }

  async getExpedientesConOfertasAdmin(): Promise<ExpedienteConOfertaAdmin[]> {
    const estados: EstadoExpediente[] = ['estimado', 'en_oferta', 'adjudicado'];
    const exps = await this.expedienteRepo.findByFiltro({ estados });
    if (!exps.length) return [];

    const servicioIds   = [...new Set(exps.map(e => e.servicio_id))];
    const expedienteIds = exps.map(e => e.id);
    const userIds       = [...new Set([
      ...exps.map(e => e.cliente_id),
      ...exps.filter(e => e.estimador_id).map(e => e.estimador_id as string),
    ])];

    const [servicios, perfiles, ofertasRaw, estimaciones, localizaciones] = await Promise.all([
      this.servicioRepo.findByIds(servicioIds),
      this.perfilRepo.findByIds(userIds),
      this.ofertaRepo.findByExpedienteIds(expedienteIds),
      this.estimacionRepo.findFechasByExpedienteIds(expedienteIds),
      this.localizacionRepo.findByExpedienteIds(expedienteIds),
    ]);

    // Miniatura del tour 3D (Matterport) por expediente.
    const fotoPorExpediente = new Map<string, string>();
    for (const est of estimaciones) {
      const thumb = matterportThumbFromTour(est.url_tour);
      if (thumb) fotoPorExpediente.set(est.expediente_id, thumb);
    }

    const constructorIds = [...new Set(ofertasRaw.map(o => o.constructor_id))];
    const constructores  = constructorIds.length
      ? await this.perfilRepo.findByIds(constructorIds)
      : [];

    return exps.map(e => {
      const svc       = servicios.find(s => s.id === e.servicio_id);
      const cliente   = perfiles.find(p => p.id === e.cliente_id);
      const estimador = e.estimador_id ? perfiles.find(p => p.id === e.estimador_id) : null;
      const loc       = localizaciones.find(l => l.expediente_id === e.id) ?? null;

      const expOfertas = ofertasRaw.filter(o => o.expediente_id === e.id);
      let oferta: OfertaRaw | null = null;
      if (e.estado === 'adjudicado') {
        oferta = expOfertas.find(o => o.estado === 'aceptada') ?? expOfertas[0] ?? null;
      } else {
        oferta = expOfertas[0] ?? null;
      }

      const constructor = oferta ? constructores.find(c => c.id === oferta!.constructor_id) : null;

      return {
        id:                  e.id,
        numero:              e.numero,
        estado:              e.estado,
        creado_en:           e.creado_en,
        servicio_nombre:     svc?.nombre_es        ?? '—',
        servicio_nombre_en:  svc?.nombre_en        ?? svc?.nombre_es ?? '—',
        servicio_nombre_fr:  svc?.nombre_fr        ?? svc?.nombre_es ?? '—',
        cliente_nombre:      cliente    ? `${cliente.nombre}    ${cliente.apellido}`.trim()    : '—',
        estimador_nombre:    estimador  ? `${estimador.nombre}  ${estimador.apellido}`.trim()  : null,
        oferta_id:           oferta?.id            ?? null,
        constructor_nombre:  constructor ? `${constructor.nombre} ${constructor.apellido}`.trim() : null,
        oferta_precio:       oferta?.precio        ?? null,
        oferta_fecha_inicio: oferta?.fecha_inicio  ?? null,
        oferta_estado:       oferta?.estado        ?? null,
        total_ofertas:       expOfertas.length,
        sort_date:           oferta?.creado_en     ?? e.creado_en,
        foto:                fotoPorExpediente.get(e.id) ?? null,
        direccion:           loc?.direccion        ?? '',
        provincia:           loc?.provincia        ?? '',
        canton:              loc?.canton           ?? '',
        distrito:            loc?.distrito         ?? '',
      } as ExpedienteConOfertaAdmin;
    }).sort((a, b) => b.sort_date.localeCompare(a.sort_date));
  }

  async getExpedienteParaEdicion(id: string): Promise<ExpedienteParaEdicion> {
    const [exp, loc] = await Promise.all([
      this.expedienteRepo.findForEdicion(id),
      this.localizacionRepo.findFullByExpedienteId(id),
    ]);

    if (!exp) throw new Error('file.not_found');

    return {
      id:            exp.id,
      numero:        exp.numero,
      estado:        exp.estado,
      servicio_id:   exp.servicio_id,
      cliente_id:    exp.cliente_id,
      fecha_visita:  exp.fecha_visita,
      descripcion:   exp.descripcion ?? null,
      tipo_inmueble: loc?.tipo_inmueble ?? 'otro',
      direccion:     loc?.direccion     ?? '',
      provincia:     loc?.provincia     ?? '',
      canton:        loc?.canton        ?? '',
      distrito:      loc?.distrito      ?? '',
      referencia:    loc?.referencia    ?? null,
      latitud:       loc?.latitud       ?? null,
      longitud:      loc?.longitud      ?? null,
    };
  }

  /** Servicios del expediente, el principal primero; el resto, en orden de alta. */
  async getServiciosExpediente(id: string, principalId: number): Promise<number[]> {
    const ids = await this.expServicioRepo.findServicioIds(id);
    return [principalId, ...ids.filter(x => x !== principalId)];
  }

  /**
   * Servicios del expediente con nombres y descripciones en los tres idiomas,
   * el principal primero. Si `expediente_servicio` no responde (migración
   * pendiente) devuelve solo el principal, que siempre existe.
   */
  async getServiciosCompletos(id: string): Promise<ServicioCompleto[]> {
    const exp = await this.expedienteRepo.findForEdicion(id);
    if (!exp) throw new Error('file.not_found');

    let ids: number[];
    try {
      ids = await this.getServiciosExpediente(id, exp.servicio_id);
    } catch (e) {
      console.error('[ExpedienteService] servicios del expediente:', e);
      ids = [exp.servicio_id];
    }

    const catalogo = await this.servicioRepo.findByIdsCompleto(ids);
    return ids
      .map(sid => catalogo.find(s => s.id === sid))
      .filter((s): s is ServicioCompleto => !!s);
  }

  async actualizarExpediente(id: string, payload: {
    clienteId:   string;
    servicioId:  number;
    /**
     * Lista completa, principal primero (`admin/file/edit` y
     * `estimator/file/edit`). Si llega,
     * principal y lista se guardan juntos en un RPC atómico y el UPDATE de
     * `expediente` deja `servicio_id` sin tocar.
     */
    servicioIds?: number[];
    fechaVisita: string;
    descripcion?: string | null;
    localizacion: {
      tipo_inmueble: TipoInmueble;
      direccion:  string;
      provincia:  string;
      canton:     string;
      distrito:   string;
      referencia?: string | null;
      latitud?:    number | null;
      longitud?:   number | null;
    };
  }): Promise<void> {
    const conLista = !!payload.servicioIds?.length;
    await Promise.all([
      this.expedienteRepo.update(id, {
        cliente_id:   payload.clienteId,
        ...(conLista ? {} : { servicio_id: payload.servicioId }),
        fecha_visita: payload.fechaVisita,
        descripcion:  payload.descripcion ?? null,
      }),
      this.localizacionRepo.update(id, payload.localizacion),
      conLista ? this.expServicioRepo.guardar(id, payload.servicioIds!) : Promise.resolve(),
    ]);
  }

  // ── Transiciones de estado ────────────────────────────────────────────────

  async asignarEstimador(expedienteId: string, estimadorId: string): Promise<void> {
    return this.expedienteRepo.asignarEstimador(expedienteId, estimadorId);
  }

  /** Cambia el estimador asignado dejando el estado como está. */
  async reasignarEstimador(expedienteId: string, estimadorId: string): Promise<void> {
    return this.expedienteRepo.reasignarEstimador(expedienteId, estimadorId);
  }

  async actualizarEstado(expedienteId: string, estado: EstadoExpediente): Promise<void> {
    return this.expedienteRepo.updateEstado(expedienteId, estado);
  }

  async marcarContratado(expedienteId: string): Promise<void> {
    return this.expedienteRepo.marcarContratado(expedienteId);
  }

  async liberar(expedienteId: string): Promise<void> {
    return this.expedienteRepo.liberar(expedienteId);
  }

  // ── Historial del dashboard de cliente ───────────────────────────────────

  /**
   * Ofertas recibidas del expediente, para el historial. Los contratos (todos,
   * no solo el último) los trae `ContratoService.getPanelClienteExpediente`.
   */
  getOfertasHistorial(expedienteId: string): Promise<OfertaHistorialItem[]> {
    return this.ofertaRepo.findHistorialByExpedienteId(expedienteId);
  }
}
