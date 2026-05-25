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
};

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

@Injectable({ providedIn: 'root' })
export class OfertaRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findByExpedienteId(expedienteId: string): Promise<OfertaRaw[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select('id, expediente_id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en')
      .eq('expediente_id', expedienteId)
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
      .select('id, expediente_id, constructor_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, creado_en')
      .eq('expediente_id', expedienteId)
      .eq('constructor_id', constructorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as OfertaRaw | null;
  }

  async findExpedienteIdsByConstructorId(constructorId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id')
      .eq('constructor_id', constructorId);
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
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as OfertaConExpediente[];
  }

  async findById(ofertaId: string): Promise<OfertaConExpediente> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, expediente_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos,
        fecha_inicio, descripcion, estado, creado_en, constructor_id,
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
      .eq('estado', 'aceptada');
    if (error) throw new Error(error.message);
    return (data ?? []) as OfertaAceptada[];
  }

  async findCountByExpedienteIds(expedienteIds: string[]): Promise<{ expediente_id: string }[]> {
    if (!expedienteIds.length) return [];
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id')
      .in('expediente_id', expedienteIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as { expediente_id: string }[];
  }

  async countByExpedienteId(expedienteId: string): Promise<number> {
    const { count, error } = await this.db
      .from('oferta')
      .select('id', { count: 'exact', head: true })
      .eq('expediente_id', expedienteId);
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
      } as TablesUpdate<'oferta'>)
      .eq('id', ofertaId);
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
}
