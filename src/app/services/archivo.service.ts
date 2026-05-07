import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { ArchivoRow, BUCKET } from '../models';

export type TipoArchivo = 'foto' | 'video' | 'documento';

@Injectable({ providedIn: 'root' })
export class ArchivoService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async cargarPorTipo(expedienteId: string, tipo: TipoArchivo): Promise<ArchivoRow[]> {
    const { data } = await this.db
      .from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes')
      .eq('expediente_id', expedienteId)
      .eq('tipo', tipo)
      .order('creado_en', { ascending: false });
    return (data ?? []) as ArchivoRow[];
  }

  async listarPorExpediente(expedienteId: string): Promise<{
    fotos: ArchivoRow[];
    videos: ArchivoRow[];
    documentos: ArchivoRow[];
  }> {
    const [fotosRes, videosRes, documentosRes] = await Promise.all([
      this.db.storage.from(BUCKET).list(`expedientes/${expedienteId}/foto`,      { sortBy: { column: 'created_at', order: 'desc' } }),
      this.db.storage.from(BUCKET).list(`expedientes/${expedienteId}/video`,     { sortBy: { column: 'created_at', order: 'desc' } }),
      this.db.storage.from(BUCKET).list(`expedientes/${expedienteId}/documento`, { sortBy: { column: 'created_at', order: 'desc' } }),
    ]);

    const toRows = (tipo: string, files: any[]): ArchivoRow[] =>
      (files ?? [])
        .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
        .map(f => ({
          id:             f.id   ?? f.name,
          nombre_archivo: f.name.replace(/^\d+_/, ''),
          url_storage:    `expedientes/${expedienteId}/${tipo}/${f.name}`,
          mime_type:      f.metadata?.mimetype ?? '',
          tamano_bytes:   f.metadata?.size     ?? 0,
        }));

    return {
      fotos:      toRows('foto',      fotosRes.data     ?? []),
      videos:     toRows('video',     videosRes.data    ?? []),
      documentos: toRows('documento', documentosRes.data ?? []),
    };
  }

  async cargarPorOferta(ofertaId: string): Promise<{ documentos: ArchivoRow[]; videos: ArchivoRow[] }> {
    const { data } = await this.db
      .from('archivo')
      .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes, tipo')
      .eq('oferta_id', ofertaId)
      .order('creado_en', { ascending: false });

    const rows = (data ?? []) as any[];
    return {
      documentos: rows.filter(a => a.tipo === 'documento') as ArchivoRow[],
      videos:     rows.filter(a => a.tipo === 'video')     as ArchivoRow[],
    };
  }

  async cargarTodos(expedienteId: string): Promise<{ fotos: ArchivoRow[]; videos: ArchivoRow[]; documentos: ArchivoRow[] }> {
    const [fotos, videos, documentos] = await Promise.all([
      this.cargarPorTipo(expedienteId, 'foto'),
      this.cargarPorTipo(expedienteId, 'video'),
      this.cargarPorTipo(expedienteId, 'documento'),
    ]);
    return { fotos, videos, documentos };
  }

  async subir(
    expedienteId: string,
    tipo: TipoArchivo,
    file: File,
    userId: string
  ): Promise<void> {
    const storagePath = `expedientes/${expedienteId}/${tipo}/${Date.now()}_${file.name}`;

    const { error: upErr } = await this.db.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await this.db.from('archivo').insert({
      tipo,
      nombre_archivo: file.name,
      url_storage:    storagePath,
      mime_type:      file.type || 'application/octet-stream',
      tamano_bytes:   file.size,
      subido_por:     userId,
      expediente_id:  expedienteId,
    });

    if (dbErr) {
      await this.db.storage.from(BUCKET).remove([storagePath]);
      throw new Error(dbErr.message);
    }
  }

  async eliminar(archivo: ArchivoRow): Promise<void> {
    await this.db.storage.from(BUCKET).remove([archivo.url_storage]);
    const { error } = await this.db.from('archivo').delete().eq('id', archivo.id);
    if (error) throw new Error(error.message);
  }

  publicUrl(storagePath: string): string {
    return this.db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }
}
