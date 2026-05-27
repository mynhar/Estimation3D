import { Injectable, inject } from '@angular/core';
import { ArchivoRow } from '../models';
import { ArchivoRepository } from '../data';

export type TipoArchivo = 'foto' | 'video' | 'documento';

@Injectable({ providedIn: 'root' })
export class ArchivoService {
  private archivoRepo = inject(ArchivoRepository);

  async cargarPorTipo(expedienteId: string, tipo: TipoArchivo): Promise<ArchivoRow[]> {
    return this.archivoRepo.findByExpedienteId(expedienteId, tipo);
  }

  async listarPorExpediente(expedienteId: string): Promise<{
    fotos:      ArchivoRow[];
    videos:     ArchivoRow[];
    documentos: ArchivoRow[];
  }> {
    const [fotosRaw, videosRaw, documentosRaw] = await Promise.all([
      this.archivoRepo.listFromStorage(`expedientes/${expedienteId}/foto`),
      this.archivoRepo.listFromStorage(`expedientes/${expedienteId}/video`),
      this.archivoRepo.listFromStorage(`expedientes/${expedienteId}/documento`),
    ]);

    const toRows = (tipo: string, files: any[]): ArchivoRow[] =>
      files
        .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
        .map(f => ({
          id:             f.id   ?? f.name,
          nombre_archivo: f.name.replace(/^\d+_/, ''),
          url_storage:    `expedientes/${expedienteId}/${tipo}/${f.name}`,
          mime_type:      f.metadata?.mimetype ?? '',
          tamano_bytes:   f.metadata?.size     ?? 0,
        }));

    return {
      fotos:      toRows('foto',      fotosRaw),
      videos:     toRows('video',     videosRaw),
      documentos: toRows('documento', documentosRaw),
    };
  }

  async cargarPorOferta(ofertaId: string): Promise<{ documentos: ArchivoRow[]; videos: ArchivoRow[] }> {
    const rows = await this.archivoRepo.findByOfertaId(ofertaId);
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
    tipo:         TipoArchivo,
    file:         File,
    userId:       string,
  ): Promise<void> {
    const storagePath = `expedientes/${expedienteId}/${tipo}/${Date.now()}_${file.name}`;
    await this.archivoRepo.uploadToStorage(storagePath, file);
    try {
      await this.archivoRepo.insert({
        tipo,
        nombre_archivo: file.name,
        url_storage:    storagePath,
        mime_type:      file.type || 'application/octet-stream',
        tamano_bytes:   file.size,
        subido_por:     userId,
        expediente_id:  expedienteId,
      });
    } catch (err) {
      await this.archivoRepo.removeFromStorage([storagePath]);
      throw err;
    }
  }

  async eliminar(archivo: ArchivoRow): Promise<void> {
    await this.archivoRepo.removeFromStorage([archivo.url_storage]);
    await this.archivoRepo.deleteById(archivo.id);
  }

  async eliminarTodos(expedienteId: string): Promise<void> {
    const archivos = await this.archivoRepo.findByExpedienteId(expedienteId);
    if (archivos.length) {
      await this.archivoRepo.removeFromStorage(archivos.map(a => a.url_storage));
      await this.archivoRepo.deleteByExpedienteId(expedienteId);
    }
  }

  publicUrl(storagePath: string): string {
    return this.archivoRepo.getPublicUrl(storagePath);
  }
}
