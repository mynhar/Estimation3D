import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { OfertaForm } from '../models';
import { EstadoExpediente, EstadoOferta, TablesInsert, TablesUpdate } from '../types/supabase';

export type OfertaRaw = {
  id:                string;
  expediente_id:     string;
  constructor_id:    string;
  precio:            number;
  plazo_semanas_min: number | null;
  plazo_semanas_max: number | null;
  garantia_anos:     number | null;
  fecha_inicio:      string | null;
  descripcion:       string;
  estado:            string;
  creado_en:         string;
  /**
   * Servicios del expediente que cubre la oferta (ver
   * `20261015_oferta_servicios.sql`). Solo en las consultas que lo piden.
   */
  servicio_ids?:     number[];
  /**
   * Baja lógica. Sólo lo pide `findByExpedienteId` (pantalla de administración,
   * que tiene que enseñar también las eliminadas); el resto de consultas filtran
   * por ofertas vivas y no seleccionan estas columnas.
   */
  eliminada_en?:     string | null;
  eliminada_por?:    string | null;
};

/**
 * Columnas de `oferta` comunes a casi todas las consultas. Tiene que ser un
 * literal en una sola línea: el cliente tipado de supabase-js analiza la cadena
 * del `select` a nivel de tipos, y una concatenación se infiere como `string`.
 */
const COLS_OFERTA = 'id, expediente_id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en, servicio_ids';

/** Igual que `COLS_OFERTA` más las columnas de baja lógica. */
const COLS_OFERTA_CON_BAJA = 'id, expediente_id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en, servicio_ids, eliminada_en, eliminada_por';

export type OfertaAceptada = {
  expediente_id: string;
  precio:        number;
  fecha_inicio:  string | null;
};

/** Oferta con expediente y localizacion anidados (respuesta PostgREST). */
export type OfertaConExpediente = OfertaRaw & {
  expediente: {
    id?:          string;
    numero:       string;
    estado?:      string;
    fecha_visita?: string;
    servicio:     { nombre_es: string; nombre_en: string | null; nombre_fr: string | null } | null;
    localizacion: { direccion: string; referencia: string | null; provincia: string; canton: string; distrito: string | null } | null;
  } | null;
};

export type OfertaHistorialItem = {
  id:        string;
  creado_en: string;
  estado:    string;
};

@Injectable({ providedIn: 'root' })
export class OfertaRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findByExpedienteIds(expedienteIds: string[]): Promise<OfertaRaw[]> {
    if (!expedienteIds.length) return [];
    const { data, error } = await this.db
      .from('oferta')
      .select(COLS_OFERTA)
      .in('expediente_id', expedienteIds)
      .is('eliminada_en', null)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaRaw[];
  }

  /**
   * Por defecto sólo ofertas vivas — lo que necesitan cliente y constructor.
   * `incluirEliminadas` es para las pantallas de administración, donde el
   * requisito es que no desaparezca nada de «Ofertas recibidas». Se pide
   * explícitamente a propósito: que las bajas se colasen por omisión fue
   * exactamente el fallo que este parámetro evita.
   */
  async findByExpedienteId(
    expedienteId: string,
    incluirEliminadas = false,
  ): Promise<OfertaRaw[]> {
    const q = this.db
      .from('oferta')
      .select(COLS_OFERTA_CON_BAJA)
      .eq('expediente_id', expedienteId);
    const { data, error } = await (incluirEliminadas ? q : q.is('eliminada_en', null))
      .order('precio', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaRaw[];
  }

  async findByExpedienteIdAndConstructorId(
    expedienteId:  string,
    constructorId: string,
  ): Promise<OfertaRaw | null> {
    const { data, error } = await this.db
      .from('oferta')
      .select(COLS_OFERTA)
      .eq('expediente_id', expedienteId)
      .eq('constructor_id', constructorId)
      .is('eliminada_en', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as OfertaRaw | null;
  }

  async findExpedienteIdsByConstructorId(constructorId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id')
      .eq('constructor_id', constructorId)
      .is('eliminada_en', null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((o: { expediente_id: string }) => o.expediente_id);
  }

  async findByConstructorIdConExpediente(constructorId: string): Promise<OfertaConExpediente[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, expediente_id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max,
        garantia_anos, fecha_inicio, descripcion, estado, creado_en,
        expediente:expediente_id (
          id, numero, estado,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, referencia, provincia, canton, distrito )
        )
      `)
      .eq('constructor_id', constructorId)
      .is('eliminada_en', null)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as OfertaConExpediente[];
  }

  async findById(ofertaId: string): Promise<OfertaConExpediente> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, expediente_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos,
        fecha_inicio, descripcion, estado, creado_en, constructor_id, servicio_ids,
        expediente:expediente_id (
          numero, fecha_visita,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, referencia, provincia, canton, distrito )
        )
      `)
      .eq('id', ofertaId)
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as OfertaConExpediente;
  }

  async findAceptadasByExpedienteIds(expedienteIds: string[]): Promise<OfertaAceptada[]> {
    if (!expedienteIds.length) return [];
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id, precio, fecha_inicio')
      .in('expediente_id', expedienteIds)
      .eq('estado', 'aceptada')
      .is('eliminada_en', null);
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaAceptada[];
  }

  async findCountByExpedienteIds(expedienteIds: string[]): Promise<{ expediente_id: string }[]> {
    if (!expedienteIds.length) return [];
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id')
      .in('expediente_id', expedienteIds)
      .is('eliminada_en', null);
    if (error) throw new Error(error.message);
    return (data ?? []) as { expediente_id: string }[];
  }

  /** Cuenta para el tope de 5: las dadas de baja no ocupan plaza. */
  async countByExpedienteId(expedienteId: string): Promise<number> {
    const { count, error } = await this.db
      .from('oferta')
      .select('id', { count: 'exact', head: true })
      .eq('expediente_id', expedienteId)
      .is('eliminada_en', null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  // ── mutaciones ──────────────────────────────────────────────────────────────

  async insert(payload: {
    expediente_id:     string;
    constructor_id:    string;
    precio:            number;
    plazo_semanas_min: number | null;
    plazo_semanas_max: number | null;
    garantia_anos:     number | null;
    fecha_inicio:      string | null;
    descripcion:       string;
    estado:            EstadoOferta;
    /** Vacío o ausente = todos los del expediente (lo resuelve el trigger). */
    servicio_ids?:     number[];
  }): Promise<string> {
    const { data, error } = await this.db
      .from('oferta')
      .insert(payload as TablesInsert<'oferta'>)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async update(ofertaId: string, form: OfertaForm): Promise<void> {
    const { error } = await this.db
      .from('oferta')
      .update({
        precio:            form.precio!,
        plazo_semanas_min: form.plazo_semanas_min,
        plazo_semanas_max: form.plazo_semanas_max,
        garantia_anos:     form.garantia_anos ?? null,
        fecha_inicio:      form.fecha_inicio  || null,
        descripcion:       form.descripcion,
        ...(form.servicio_ids ? { servicio_ids: form.servicio_ids } : {}),
      } as TablesUpdate<'oferta'>)
      .eq('id', ofertaId);
    if (error) throw new Error(error.message);
  }

  /**
   * Baja lógica vía RPC: marca `eliminada_en`, escribe en `oferta_auditoria` y
   * ajusta el estado del expediente. La fila y sus ficheros se conservan, así
   * que `restaurar` puede deshacerlo.
   */
  async eliminarConCascada(ofertaId: string, expedienteId: string): Promise<void> {
    const { error } = await this.db.rpc('eliminar_oferta_admin', {
      p_oferta_id:     ofertaId,
      p_expediente_id: expedienteId,
    });
    if (error) throw new Error(error.message);
  }

  async restaurar(ofertaId: string, expedienteId: string): Promise<void> {
    const { error } = await this.db.rpc('restaurar_oferta_admin', {
      p_oferta_id:     ofertaId,
      p_expediente_id: expedienteId,
    });
    if (error) throw new Error(error.message);
  }

  // ── Reparto en bloque (administración) ──────────────────────────────────────
  // Los tres RPC son atómicos y dejan una fila por oferta en `oferta_auditoria`.
  // Ninguno genera contrato: eso sigue siendo cosa de `aceptar` (el trofeo).
  // Devuelven cuántas ofertas cambiaron realmente de estado.

  /** Las indicadas pasan a 'rechazada'; el resto no se toca. */
  async rechazarVarias(expedienteId: string, ofertaIds: string[]): Promise<number> {
    const { data, error } = await this.db.rpc('rechazar_ofertas', {
      p_expediente_id: expedienteId,
      p_ofertas:       ofertaIds,
    });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  /** Devuelve a 'pendiente' las que estuvieran 'rechazada'. */
  async reactivarVarias(expedienteId: string, ofertaIds: string[]): Promise<number> {
    const { data, error } = await this.db.rpc('reactivar_ofertas', {
      p_expediente_id: expedienteId,
      p_ofertas:       ofertaIds,
    });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  async restoreEstadoEstimado(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'estimado' as EstadoExpediente })
      .eq('id', expedienteId)
      .eq('estado', 'en_oferta');
    if (error) throw new Error(error.message);
  }

  async updateEstadoExpedienteEnOferta(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente')
      .update({ estado: 'en_oferta' as EstadoExpediente })
      .eq('id', expedienteId)
      .in('estado', ['estimado', 'en_oferta']);
    if (error) throw new Error(error.message);
  }

  async aceptar(expedienteId: string, ofertaId: string): Promise<void> {
    const { error } = await this.db.rpc('aceptar_oferta', {
      p_expediente_id: expedienteId,
      p_oferta_id:     ofertaId,
    });
    if (error) throw new Error(error.message);
  }

  async rechazar(expedienteId: string, ofertaId: string): Promise<void> {
    const { error } = await this.db.rpc('rechazar_oferta', {
      p_expediente_id: expedienteId,
      p_oferta_id:     ofertaId,
    });
    if (error) throw new Error(error.message);
  }

  async findHistorialByExpedienteId(expedienteId: string): Promise<OfertaHistorialItem[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select('id, creado_en, estado')
      .eq('expediente_id', expedienteId)
      .is('eliminada_en', null)
      .order('creado_en', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaHistorialItem[];
  }
}
