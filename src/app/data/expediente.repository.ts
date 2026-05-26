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

  async findByFiltro(options: {
    estado?:       EstadoExpediente;
    estados?:      EstadoExpediente[];
    estimadorId?:  string;
  }): Promise<ExpedienteRaw[]> {
    let query = this.db
      .from('expediente')
      .select('id, numero, fecha_visita, estado, cliente_id, servicio_id, creado_en')
      .order('creado_en', { ascending: false });
    if (options.estado)      query = query.eq('estado', options.estado);
    if (options.estados)     query = query.in('estado', options.estados);
    if (options.estimadorId) query = query.eq('estimador_id', options.estimadorId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExpedienteRaw[];
  }

  async findDisponibles(): Promise<ExpedienteRaw[]> {
    const { data, error } = await this.db
      .from('expediente')
      .select('id, numero, estado, servicio_id, cliente_id, estimador_id, fecha_visita, creado_en, descripcion')
      .in('estado', ['estimado', 'en_oferta'])
      .order('id', { ascending: false });
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
