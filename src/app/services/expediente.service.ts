import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import {
  ExpedienteCliente,
  ExpedienteConOfertas,
  ExpedienteDetalleCliente,
  ExpedienteRow,
  ExpedienteDetalle,
  ExpedienteDisponible,
  ExpedienteParaOferta,
  ExpedienteVistaCliente,
} from '../models';
import { EstadoExpediente, TipoInmueble } from '../types/supabase';

@Injectable({ providedIn: 'root' })
export class ExpedienteService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  // ── Módulo cliente ────────────────────────────────────────────────────────

  async getMisExpedientes(clienteId: string): Promise<ExpedienteCliente[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, descripcion, servicio:servicio_id(nombre_fr, nombre_en, nombre_es)')
      .eq('cliente_id', clienteId)
      .order('id', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ExpedienteCliente[];
  }

  async getDetalleParaCliente(expedienteId: string): Promise<ExpedienteDetalleCliente> {
    const { data: exp, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, creado_en, servicio_id, cliente_id')
      .eq('id', expedienteId)
      .single();

    if (error) throw new Error(error.message);

    const [servicioRes, locRes, perfilRes] = await Promise.all([
      this.db.from('servicio').select('nombre_es').eq('id', exp.servicio_id).single(),
      this.db.from('localizacion')
        .select('direccion, referencia, provincia, canton, distrito')
        .eq('expediente_id', expedienteId).single(),
      this.db.from('perfil').select('nombre, apellido').eq('id', exp.cliente_id).single(),
    ]);

    const servicio = servicioRes.data;
    const loc      = locRes.data;
    const perfil   = perfilRes.data;

    return {
      id:              exp.id,
      numero:          exp.numero,
      estado:          exp.estado,
      fecha_visita:    exp.fecha_visita    ?? '',
      creado_en:       exp.creado_en       ?? '',
      servicio_nombre: servicio?.nombre_es ?? '—',
      cliente_nombre:  perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
      direccion:       loc?.direccion  ?? '—',
      referencia:      loc?.referencia ?? '',
      provincia:       loc?.provincia  ?? '—',
      canton:          loc?.canton     ?? '—',
      distrito:        loc?.distrito   ?? '—',
    };
  }

  async getVistaParaCliente(expedienteId: string): Promise<ExpedienteVistaCliente> {
    const { data: exp, error: expError } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, creado_en, servicio_id, cliente_id, estimador_id')
      .eq('id', expedienteId)
      .single();

    if (expError) throw new Error(expError.message);
    if (!exp)     throw new Error('file.not_found');

    const expAny = exp as any;

    const [servicioRes, locRes, clienteRes, estimacionRes] = await Promise.all([
      this.db.from('servicio').select('nombre_es').eq('id', expAny.servicio_id).single(),
      this.db.from('localizacion')
        .select('direccion, referencia, provincia, canton, distrito')
        .eq('expediente_id', expedienteId).single(),
      this.db.from('perfil').select('nombre, apellido').eq('id', expAny.cliente_id).single(),
      this.db.from('estimacion')
        .select('fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max, url_tour')
        .eq('expediente_id', expedienteId).maybeSingle(),
    ]);

    let estimadorNombre: string | null = null;
    if (expAny.estimador_id) {
      const { data: est } = await this.db
        .from('perfil').select('nombre, apellido').eq('id', expAny.estimador_id).single();
      if (est) estimadorNombre = `${est.nombre} ${est.apellido}`;
    }

    const servicio   = servicioRes.data;
    const loc        = locRes.data;
    const cliente    = clienteRes.data;
    const estimacion = estimacionRes.data;

    return {
      id:              expedienteId,
      numero:          expAny.numero,
      estado:          expAny.estado   ?? '',
      fecha_visita:    expAny.fecha_visita ?? '',
      creado_en:       expAny.creado_en    ?? '',
      servicio_nombre: servicio?.nombre_es ?? '—',
      cliente_nombre:  cliente ? `${cliente.nombre} ${cliente.apellido}` : '—',
      direccion:       loc?.direccion  ?? '—',
      referencia:      loc?.referencia ?? '',
      provincia:       loc?.provincia  ?? '—',
      canton:          loc?.canton     ?? '—',
      distrito:        loc?.distrito   ?? '—',
      estimador_nombre:     estimadorNombre,
      fecha_visita_real:    estimacion?.fecha_visita_real     ?? null,
      descripcion_problemas: estimacion?.descripcion_problemas ?? null,
      costo_estimado:        estimacion?.costo_estimado        ?? null,
      costo_estimado_max:    estimacion?.costo_estimado_max    ?? null,
      url_tour:              (estimacion as any)?.url_tour     ?? null,
    };
  }

  async getExpedientesConOfertas(clienteId: string): Promise<ExpedienteConOfertas[]> {
    const { data: exps, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, servicio_id')
      .eq('cliente_id', clienteId)
      .in('estado', ['en_oferta', 'adjudicado', 'contratado'])
      .order('id', { ascending: false });

    if (error) throw new Error(error.message);
    if (!exps?.length) return [];

    const servicioIds   = [...new Set(exps.map((e: any) => e.servicio_id))];
    const expedienteIds = exps.map((e: any) => e.id);

    const [serviciosRes, locRes, ofertasRes] = await Promise.all([
      this.db.from('servicio').select('id, nombre_es').in('id', servicioIds),
      this.db.from('localizacion')
        .select('expediente_id, direccion, referencia, provincia, canton, distrito')
        .in('expediente_id', expedienteIds),
      this.db.from('oferta')
        .select('expediente_id')
        .in('expediente_id', expedienteIds),
    ]);

    if (serviciosRes.error) throw new Error(serviciosRes.error.message);
    if (locRes.error)       throw new Error(locRes.error.message);
    if (ofertasRes.error)   throw new Error(ofertasRes.error.message);

    const servicios = serviciosRes.data ?? [];
    const locs      = locRes.data       ?? [];

    const countMap = new Map<string, number>();
    for (const o of ofertasRes.data ?? []) {
      const key = String(o.expediente_id);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return exps.map((e: any) => {
      const servicio = servicios.find((s: any) => String(s.id) === String(e.servicio_id));
      const loc      = locs.find((l: any) => String(l.expediente_id) === String(e.id));
      return {
        id:              e.id,
        numero:          e.numero,
        estado:          e.estado,
        fecha_visita:    e.fecha_visita,
        servicio_nombre: servicio?.nombre_es ?? '—',
        direccion:       loc?.direccion  ?? '—',
        referencia:      loc?.referencia ?? '',
        provincia:       loc?.provincia  ?? '—',
        canton:          loc?.canton     ?? '—',
        distrito:        loc?.distrito   ?? '—',
        total_ofertas:   countMap.get(String(e.id)) ?? 0,
      } as ExpedienteConOfertas;
    });
  }

  async crear(payload: {
    clienteId: string;
    servicioId: number;
    numero: string;
    fechaVisita: string;
    descripcion?: string | null;
    localizacion: {
      tipo_inmueble: TipoInmueble;
      direccion: string;
      provincia: string;
      canton: string;
      distrito: string;
      referencia?: string | null;
      latitud?: number | null;
      longitud?: number | null;
    };
  }): Promise<string> {
    const { data: exp, error: expError } = await this.db
      .from('expediente')
      .insert({
        numero:       payload.numero,
        cliente_id:   payload.clienteId,
        servicio_id:  payload.servicioId,
        estado:       'nuevo',
        fecha_visita: payload.fechaVisita,
        descripcion:  payload.descripcion ?? null,
      })
      .select('id')
      .single();

    if (expError) throw new Error(expError.message);
    if (!exp?.id)  throw new Error('file.err_create_no_id');

    const { error: locError } = await this.db
      .from('localizacion')
      .insert({ expediente_id: exp.id, ...payload.localizacion });
    if (locError) throw new Error(`Error al guardar localización: ${locError.message}`);

    return exp.id;
  }

  async contarExpedientesCliente(clienteId: string): Promise<{ primeroId: string | null; hayMasDeUno: boolean }> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id')
      .eq('cliente_id', clienteId)
      .order('id', { ascending: false })
      .limit(2);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return { primeroId: rows[0]?.id ?? null, hayMasDeUno: rows.length > 1 };
  }

  // ── Módulo estimador — listas ─────────────────────────────────────────────

  async getExpedienteRows(options: {
    estado?: EstadoExpediente;
    estados?: EstadoExpediente[];
    estimadorId?: string;
  }): Promise<ExpedienteRow[]> {
    let query = this.db
      .from('expediente')
      .select('id, numero, fecha_visita, estado, cliente_id, servicio_id')
      .order('id', { ascending: false });

    if (options.estado)      query = query.eq('estado', options.estado);
    if (options.estados)     query = query.in('estado', options.estados);
    if (options.estimadorId) query = query.eq('estimador_id', options.estimadorId);

    const { data: exps, error } = await query;
    if (error) throw error;
    if (!exps?.length) return [];

    const clienteIds    = [...new Set(exps.map((e: any) => e.cliente_id))];
    const servicioIds   = [...new Set(exps.map((e: any) => e.servicio_id))];
    const expedienteIds = exps.map((e: any) => e.id);

    const [perfilesRes, serviciosRes, locRes] = await Promise.all([
      this.db.from('perfil').select('id, nombre, apellido').in('id', clienteIds),
      this.db.from('servicio').select('id, nombre_es').in('id', servicioIds),
      this.db.from('localizacion')
        .select('expediente_id, direccion, provincia, canton, distrito')
        .in('expediente_id', expedienteIds),
    ]);

    const perfiles  = perfilesRes.data  ?? [];
    const servicios = serviciosRes.data ?? [];
    const locs      = locRes.data       ?? [];

    return exps.map((e: any) => {
      const perfil   = perfiles.find((p: any) => String(p.id) === String(e.cliente_id));
      const servicio = servicios.find((s: any) => String(s.id) === String(e.servicio_id));
      const loc      = locs.find((l: any) => String(l.expediente_id) === String(e.id));

      return {
        id:              e.id,
        numero:          e.numero,
        fecha_visita:    e.fecha_visita,
        estado:          e.estado,
        servicio_nombre: servicio?.nombre_es ?? '—',
        cliente_nombre:  perfil ? `${perfil.nombre} ${perfil.apellido}` : '—',
        direccion:       loc?.direccion ?? '—',
        provincia:       loc?.provincia ?? '—',
        canton:          loc?.canton    ?? '—',
        distrito:        loc?.distrito  ?? '—',
      } as ExpedienteRow;
    });
  }

  // ── Módulo estimador — detalle ────────────────────────────────────────────

  async getDetalle(id: string): Promise<ExpedienteDetalle> {
    const { data: exp, error: expError } = await this.db
      .from('expediente')
      .select('numero, estado, fecha_visita, descripcion, cliente_id, servicio_id, estimador_id')
      .eq('id', id)
      .maybeSingle();

    if (expError) throw new Error(expError.message);
    if (!exp)     throw new Error('file.not_found');

    const [servicioRes, perfilRes, locRes, estimadorRes] = await Promise.all([
      this.db.from('servicio').select('nombre_es').eq('id', exp.servicio_id).single(),
      this.db.from('perfil').select('nombre, apellido, telefono').eq('id', exp.cliente_id).single(),
      this.db.from('localizacion')
        .select('direccion, referencia, provincia, canton, distrito')
        .eq('expediente_id', id)
        .single(),
      exp.estimador_id
        ? this.db.from('perfil').select('nombre, apellido').eq('id', exp.estimador_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const estimador = estimadorRes.data as { nombre: string; apellido: string } | null;

    return {
      numero:           exp.numero,
      estado:           exp.estado,
      fecha_visita:     exp.fecha_visita,
      descripcion:      exp.descripcion ?? '',
      servicio_nombre:  servicioRes.data?.nombre_es ?? '—',
      cliente_nombre:   perfilRes.data
        ? `${perfilRes.data.nombre} ${perfilRes.data.apellido}`
        : '—',
      cliente_telefono: perfilRes.data?.telefono ?? '',
      direccion:  locRes.data?.direccion  ?? '—',
      referencia: locRes.data?.referencia ?? '—',
      provincia:  locRes.data?.provincia  ?? '—',
      canton:     locRes.data?.canton     ?? '—',
      distrito:   locRes.data?.distrito   ?? '—',
      estimador_nombre: estimador
        ? `${estimador.nombre} ${estimador.apellido}`
        : '—',
    };
  }

  // ── Módulo constructor ────────────────────────────────────────────────────

  async getExpedientesDisponibles(): Promise<ExpedienteDisponible[]> {
    const { data: exps, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, servicio_id')
      .in('estado', ['estimado', 'en_oferta'])
      .order('id', { ascending: false });

    if (error) throw new Error(error.message);
    if (!exps?.length) return [];

    const servicioIds   = [...new Set(exps.map((e: any) => e.servicio_id))];
    const expedienteIds = exps.map((e: any) => e.id);

    const [serviciosRes, locRes, estimacionRes, ofertasCountRes] = await Promise.all([
      this.db.from('servicio').select('id, nombre_es').in('id', servicioIds),
      this.db.from('localizacion')
        .select('expediente_id, direccion, provincia, canton, distrito')
        .in('expediente_id', expedienteIds),
      this.db.from('estimacion')
        .select('expediente_id, costo_estimado, costo_estimado_max')
        .in('expediente_id', expedienteIds),
      this.db.rpc('contar_ofertas_expedientes', { p_ids: expedienteIds }),
    ]);

    const servicios      = serviciosRes.data    ?? [];
    const locs           = locRes.data          ?? [];
    const estimaciones   = estimacionRes.data   ?? [];
    const ofertasCounts  = ofertasCountRes.data ?? [];

    return exps.map((e: any) => {
      const servicio   = servicios.find((s: any) => String(s.id) === String(e.servicio_id));
      const loc        = locs.find((l: any) => String(l.expediente_id) === String(e.id));
      const estimacion = estimaciones.find((est: any) => String(est.expediente_id) === String(e.id));
      const total      = ofertasCounts.find((c: any) => String(c.expediente_id) === String(e.id))?.total ?? 0;

      return {
        id:              e.id,
        numero:          e.numero,
        estado:          e.estado,
        servicio_nombre: servicio?.nombre_es ?? '—',
        direccion:       loc?.direccion ?? '—',
        provincia:       loc?.provincia ?? '—',
        canton:          loc?.canton    ?? '—',
        distrito:        loc?.distrito  ?? '—',
        costo_estimado:     estimacion?.costo_estimado     ?? null,
        costo_estimado_max: estimacion?.costo_estimado_max ?? null,
        total_ofertas:      total,
      } as ExpedienteDisponible;
    }).filter((r) =>
      r.estado === 'estimado' ||
      (r.estado === 'en_oferta' && r.total_ofertas < 5)
    );
  }

  async getExpedienteParaOferta(id: string): Promise<ExpedienteParaOferta> {
    const { data: exp, error: expError } = await this.db
      .from('expediente')
      .select('numero, fecha_visita, servicio_id')
      .eq('id', id)
      .maybeSingle();

    if (expError) throw new Error(expError.message);
    if (!exp)     throw new Error('file.not_found');

    const [servicioRes, locRes, estimacionRes, ofertasRes] = await Promise.all([
      this.db.from('servicio').select('nombre_es, descripcion_es').eq('id', exp.servicio_id).single(),
      this.db.from('localizacion')
        .select('direccion, referencia, provincia, canton, distrito')
        .eq('expediente_id', id).single(),
      this.db.from('estimacion')
        .select('descripcion_problemas, costo_estimado, costo_estimado_max, fecha_visita_real, url_tour')
        .eq('expediente_id', id).maybeSingle(),
      this.db.from('oferta')
        .select('id', { count: 'exact', head: true })
        .eq('expediente_id', id),
    ]);

    const servicio   = servicioRes.data;
    const loc        = locRes.data;
    const estimacion = estimacionRes.data;

    return {
      id,
      numero:               exp.numero,
      fecha_visita:         exp.fecha_visita,
      servicio_nombre:      servicio?.nombre_es      ?? '—',
      servicio_descripcion: servicio?.descripcion_es ?? '',
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
      total_ofertas:         ofertasRes.count                  ?? 0,
    };
  }

  // ── Transiciones de estado ────────────────────────────────────────────────

  async asignarEstimador(expedienteId: string, estimadorId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'en_estimacion', estimador_id: estimadorId })
      .eq('id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async actualizarEstado(expedienteId: string, estado: EstadoExpediente): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado })
      .eq('id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async liberar(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'nuevo', estimador_id: null })
      .eq('id', expedienteId);
    if (error) throw new Error(error.message);
  }
}
