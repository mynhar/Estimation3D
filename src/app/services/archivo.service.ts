import { Injectable, inject } from '@angular/core';
import { ArchivoRow } from '../models';
import { ArchivoRepository } from '../data';

export type TipoArchivo = 'foto' | 'video' | 'documento';
export type ReporteMediaTipo = 'reporte_foto' | 'reporte_video' | 'reporte_documento';

export interface ReporteArchivoRow extends ArchivoRow {
  tipo: ReporteMediaTipo;
}

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

  async cargarPorReporte(reporteId: string): Promise<{
    fotos:      ReporteArchivoRow[];
    videos:     ReporteArchivoRow[];
    documentos: ReporteArchivoRow[];
  }> {
    const rows = await this.archivoRepo.findByReporteId(reporteId);
    const cast = rows as unknown as ReporteArchivoRow[];
    return {
      fotos:      cast.filter(r => r.tipo === 'reporte_foto'),
      videos:     cast.filter(r => r.tipo === 'reporte_video'),
      documentos: cast.filter(r => r.tipo === 'reporte_documento'),
    };
  }

  // Carga la media de varios partes a la vez y la agrupa por reporte_id.
  // Cada reporte solicitado tiene su entrada (aunque esté vacía).
  async cargarPorReportes(reporteIds: string[]): Promise<Map<string, {
    fotos:      ReporteArchivoRow[];
    videos:     ReporteArchivoRow[];
    documentos: ReporteArchivoRow[];
  }>> {
    const map = new Map<string, { fotos: ReporteArchivoRow[]; videos: ReporteArchivoRow[]; documentos: ReporteArchivoRow[] }>();
    for (const id of reporteIds) map.set(id, { fotos: [], videos: [], documentos: [] });
    if (!reporteIds.length) return map;

    const rows = await this.archivoRepo.findByReporteIds(reporteIds) as unknown as (ReporteArchivoRow & { reporte_id: string })[];
    for (const r of rows) {
      const bucket = map.get(r.reporte_id);
      if (!bucket) continue;
      if (r.tipo === 'reporte_foto')          bucket.fotos.push(r);
      else if (r.tipo === 'reporte_video')    bucket.videos.push(r);
      else if (r.tipo === 'reporte_documento') bucket.documentos.push(r);
    }
    return map;
  }

  async subirParaReporte(
    seguimientoId: string,
    reporteId:     string,
    tipo:          ReporteMediaTipo,
    file:          File,
    userId:        string,
  ): Promise<void> {
    const subDir      = tipo.replace('reporte_', '');
    const storagePath = `reportes/${seguimientoId}/${reporteId}/${subDir}/${Date.now()}_${file.name}`;
    await this.archivoRepo.uploadToStorage(storagePath, file);
    try {
      await this.archivoRepo.insert({
        tipo:           tipo as any,
        nombre_archivo: file.name,
        url_storage:    storagePath,
        mime_type:      file.type || 'application/octet-stream',
        tamano_bytes:   file.size,
        subido_por:     userId,
        reporte_id:     reporteId,
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

  async eliminarPorReporte(reporteId: string): Promise<void> {
    const rows = await this.archivoRepo.findByReporteId(reporteId);
    if (rows.length) {
      await this.archivoRepo.removeFromStorage(rows.map(r => r.url_storage));
      await this.archivoRepo.deleteByReporteId(reporteId);
    }
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
