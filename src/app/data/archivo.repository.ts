import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { ArchivoRow, BUCKET } from '../models';
import { TablesInsert, TipoArchivo } from '../types/supabase';

export type ArchivoConTipo = ArchivoRow & { tipo: string };
export type ArchivoConOferta = ArchivoConTipo & { oferta_id: string };

export type ArchivoInsertData = {
  tipo:           TipoArchivo;
  nombre_archivo: string;
  url_storage:    string;
  mime_type:      string;
  tamano_bytes:   number;
  subido_por:     string;
  oferta_id?:     string;
  expediente_id?: string;
};

@Injectable({ providedIn: 'root' })
export class ArchivoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  // ── DB queries ──────────────────────────────────────────────────────────────

  async findByExpedienteId(expedienteId: string, tipo?: TipoArchivo): Promise<ArchivoRow[]> {
    const query = this.db
      .from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
      .eq('expediente_id', expedienteId)
      .order('creado_en', { ascending: false });
    const { data } = await (tipo ? query.eq('tipo', tipo) : query);
    return (data ?? []) as ArchivoRow[];
  }

  async findByOfertaIds(ofertaIds: string[]): Promise<ArchivoConOferta[]> {
    if (!ofertaIds.length) return [];
    const { data, error } = await this.db
      .from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes, tipo, oferta_id')
      .in('oferta_id', ofertaIds)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ArchivoConOferta[];
  }

  async findByOfertaId(ofertaId: string): Promise<ArchivoConTipo[]> {
    const { data } = await this.db
      .from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes, tipo')
      .eq('oferta_id', ofertaId)
      .order('creado_en', { ascending: false });
    return (data ?? []) as unknown as ArchivoConTipo[];
  }

  async findByOfertaIdAndTipo(ofertaId: string, tipo: TipoArchivo): Promise<{ id: string; url_storage: string } | null> {
    const { data } = await this.db
      .from('archivo')
      .select('id, url_storage')
      .eq('oferta_id', ofertaId)
      .eq('tipo', tipo)
      .maybeSingle();
    return data as { id: string; url_storage: string } | null;
  }

  async insert(data: ArchivoInsertData): Promise<void> {
    const { error } = await this.db.from('archivo').insert(data as TablesInsert<'archivo'>);
    if (error) throw new Error(error.message);
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.db.from('archivo').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // ── Storage operations ──────────────────────────────────────────────────────

  async uploadToStorage(path: string, file: File): Promise<void> {
    const { error } = await this.db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
  }

  async removeFromStorage(paths: string[]): Promise<void> {
    if (paths.length) await this.db.storage.from(BUCKET).remove(paths);
  }

  async listFromStorage(prefix: string): Promise<{ id: string; name: string; metadata: Record<string, unknown> }[]> {
    const { data } = await this.db.storage
      .from(BUCKET)
      .list(prefix, { sortBy: { column: 'created_at', order: 'desc' } });
    return (data ?? []) as { id: string; name: string; metadata: Record<string, unknown> }[];
  }

  getPublicUrl(path: string): string {
    return this.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
