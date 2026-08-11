import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { EstadoExpediente, TablesInsert, TablesUpdate, TipoInmueble } from '../types/supabase';

export type ExpedienteRaw = {
  id:           string;
  numero:       string;
  estado:       string;
  fecha_visita: string;
  creado_en:    string;
  descripcion:  string | null;
  cliente_id:   string;
  estimador_id: string | null;
  servicio_id:  number;
};

export type ExpedienteIdCount = { id: string }[];

export type OfertaAceptadaRaw = {
  expediente_id: string;
  precio:        number;
  fecha_inicio:  string | null;
};

export type OfertaConteoRaw = { expediente_id: string; total: number };

/** Fila de la vista `expediente_busqueda`: expediente + su localizacion. */
export type ExpedienteConDireccionRaw = ExpedienteRaw & {
  direccion: string | null;
  provincia: string | null;
  canton:    string | null;
  distrito:  string | null;
};

/**
 * Trocea la búsqueda en términos normalizados igual que `busqueda_texto` en la
 * vista `expediente_busqueda`: minúsculas y sin acentos, para que "Montreal"
 * encuentre "Montréal". Ambos lados deben normalizar idéntico.
 * Los `%` y `_` se escapan: en un LIKE son comodines.
 */
function normalizarBusqueda(busqueda: string | undefined): string[] {
  return (busqueda ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/[%_\\]/g, m => `\\${m}`));
}

@Injectable({ providedIn: 'root' })
export class ExpedienteRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  // ── lecturas ────────────────────────────────────────────────────────────────

  async findByClienteId(clienteId: string): Promise<ExpedienteRaw[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, creado_en, descripcion, cliente_id, estimador_id, servicio_id')
      .eq('cliente_id', clienteId)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpedienteRaw[];
  }

  async findHistorialByClienteId(clienteId: string): Promise<{
    id: string; numero: string; estado: string;
    creado_en: string; fecha_visita: string; actualizado_en: string;
  }[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, creado_en, fecha_visita, actualizado_en')
      .eq('cliente_id', clienteId)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string; numero: string; estado: string;
      creado_en: string; fecha_visita: string; actualizado_en: string;
    }[];
  }

  async findByClienteIdInEstados(clienteId: string, estados: EstadoExpediente[]): Promise<ExpedienteRaw[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, servicio_id')
      .eq('cliente_id', clienteId)
      .in('estado', estados)
      .order('id', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpedienteRaw[];
  }

  async findById(id: string): Promise<ExpedienteRaw> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, creado_en, descripcion, cliente_id, estimador_id, servicio_id')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data as ExpedienteRaw;
  }

  async findAll(): Promise<ExpedienteRaw[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, fecha_visita, creado_en, descripcion, cliente_id, estimador_id, servicio_id')
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpedienteRaw[];
  }

  async findAllPaginated(options: {
    page:      number;
    pageSize:  number;
    estado?:   string;
    busqueda?: string;
  }): Promise<{ data: ExpedienteConDireccionRaw[]; count: number }> {
    const offset = (options.page - 1) * options.pageSize;

    // Se consulta la vista `expediente_busqueda` (expediente + localizacion
    // aplanados) para poder filtrar por dirección sin romper la paginación ni
    // el total. Hereda las RLS de las tablas base vía security_invoker.
    let query = this.db
      .from('expediente_busqueda')
      .select(
        'id, numero, estado, fecha_visita, creado_en, descripcion, cliente_id, estimador_id, servicio_id, direccion, provincia, canton, distrito',
        { count: 'exact' },
      )
      .order('creado_en', { ascending: false })
      .range(offset, offset + options.pageSize - 1);

    if (options.estado && options.estado !== 'todos') {
      query = query.eq('estado', options.estado as EstadoExpediente);
    }

    // Cada término debe aparecer (los ilike encadenados se combinan con AND),
    // así "Verdun H3B" cruza ciudad y código postal. La consulta se normaliza
    // igual que `busqueda_texto` en la vista: minúsculas y sin acentos.
    for (const termino of normalizarBusqueda(options.busqueda)) {
      query = query.ilike('busqueda_texto', `%${termino}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as ExpedienteConDireccionRaw[], count: count ?? 0 };
  }

  async findByFiltro(options: {
    estado?:       EstadoExpediente;
    estados?:      EstadoExpediente[];
    estimadorId?:  string;
  }): Promise<ExpedienteRaw[]> {
    let query = this.db
      .from('expediente')
      .select('id, numero, fecha_visita, estado, cliente_id, estimador_id, servicio_id, creado_en')
      .order('creado_en', { ascending: false });
    if (options.estado)      query = query.eq('estado', options.estado);
    if (options.estados)     query = query.in('estado', options.estados);
    if (options.estimadorId) query = query.eq('estimador_id', options.estimadorId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExpedienteRaw[];
  }

  /**
   * Expedientes de un estimador por las dos vías que lo vinculan:
   * `expediente.estimador_id` (asignación actual, que se reescribe al reasignar)
   * y `estimacion.estimador_id` (autoría de la estimación, que es estable).
   * Mismo criterio que `fn_estimador_de_expediente` en la base y que
   * `ContratoRepository.findByEstimadorId`.
   */
  async findDeEstimador(estimadorId: string): Promise<ExpedienteRaw[]> {
    const { data: estimadas, error: errEst } = await this.db
      .from('estimacion')
      .select('expediente_id')
      .eq('estimador_id', estimadorId);
    if (errEst) throw new Error(errEst.message);

    const ids = [...new Set((estimadas ?? []).map(r => (r as { expediente_id: string }).expediente_id))];

    const filtro = ids.length
      ? `estimador_id.eq.${estimadorId},id.in.(${ids.join(',')})`
      : `estimador_id.eq.${estimadorId}`;

    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, fecha_visita, estado, cliente_id, estimador_id, servicio_id, creado_en')
      .or(filtro)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpedienteRaw[];
  }

  async findDisponibles(): Promise<ExpedienteRaw[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, servicio_id, cliente_id, estimador_id, fecha_visita, creado_en, descripcion')
      .in('estado', ['estimado', 'en_oferta'])
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpedienteRaw[];
  }

  async findForEdicion(id: string): Promise<ExpedienteRaw & { tipo_inmueble?: string } | null> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, servicio_id, cliente_id, fecha_visita, descripcion, estimador_id, creado_en')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data as ExpedienteRaw | null;
  }

  async countByClienteId(clienteId: string): Promise<{ primeroId: string | null; hayMasDeUno: boolean }> {
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

  async countOfertasPorExpediente(expedienteIds: string[]): Promise<OfertaConteoRaw[]> {
    if (!expedienteIds.length) return [];
    const { data, error } = await this.db.rpc('contar_ofertas_expedientes', { p_ids: expedienteIds });
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaConteoRaw[];
  }

  // ── mutaciones ──────────────────────────────────────────────────────────────

  async insert(payload: {
    numero:       string;
    cliente_id:   string;
    servicio_id:  number;
    estado:       EstadoExpediente;
    fecha_visita: string;
    descripcion:  string | null;
  }): Promise<string> {
    const { data, error } = await this.db
      .from('expediente')
      .insert(payload as TablesInsert<'expediente'>)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error('file.err_create_no_id');
    return data.id;
  }

  async update(id: string, payload: {
    cliente_id:   string;
    servicio_id:  number;
    fecha_visita: string;
    descripcion:  string | null;
  }): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update(payload as TablesUpdate<'expediente'>)
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async updateEstado(id: string, estado: EstadoExpediente): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async marcarContratado(expedienteId: string): Promise<void> {
    const { error } = await this.db.rpc('marcar_contratado', { p_expediente_id: expedienteId });
    if (error) throw new Error(error.message);
  }

  async asignarEstimador(expedienteId: string, estimadorId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'en_estimacion' as EstadoExpediente, estimador_id: estimadorId })
      .eq('id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async liberar(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'nuevo' as EstadoExpediente, estimador_id: null })
      .eq('id', expedienteId);
    if (error) throw new Error(error.message);
  }
}
