import { Injectable, inject } from '@angular/core';
import { OfertaConConstructor, OfertaDashboard, OfertaDetalle, OfertaForm, OfertaRow, ArchivoRow } from '../models';
import {
  OfertaRepository,
  ArchivoRepository,
  PerfilRepository,
  EstimacionRepository,
} from '../data';
import { matterportThumbFromTour } from '../shared/util/matterport';

@Injectable({ providedIn: 'root' })
export class OfertaService {
  private ofertaRepo     = inject(OfertaRepository);
  private archivoRepo    = inject(ArchivoRepository);
  private perfilRepo     = inject(PerfilRepository);
  private estimacionRepo = inject(EstimacionRepository);

  async getOfertasDeExpediente(expedienteId: string): Promise<OfertaConConstructor[]> {
    const ofertas = await this.ofertaRepo.findByExpedienteId(expedienteId);
    if (!ofertas.length) return [];

    const constructorIds = [...new Set(ofertas.map(o => o.constructor_id))];
    const ofertaIds      = ofertas.map(o => o.id);

    const [perfiles, archivos] = await Promise.all([
      this.perfilRepo.findByIdsWithContact(constructorIds),
      this.archivoRepo.findByOfertaIds(ofertaIds),
    ]);

    return ofertas.map(o => {
      const perfil        = perfiles.find(p => p.id === o.constructor_id);
      const archivosOferta = archivos.filter(a => a.oferta_id === o.id);
      return {
        id:                o.id,
        constructor_id:    o.constructor_id,
        precio:            o.precio,
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        garantia_anos:     o.garantia_anos ?? null,
        fecha_inicio:      o.fecha_inicio  ?? '',
        descripcion:       o.descripcion,
        estado:            o.estado,
        constructor_nombre:   perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() || '—' : '—',
        constructor_telefono: perfil?.telefono ?? '—',
        constructor_email:    perfil?.email    ?? '—',
        documentos: archivosOferta.filter(a => a.tipo === 'documento') as ArchivoRow[],
        videos:     archivosOferta.filter(a => a.tipo === 'video')     as ArchivoRow[],
      } as OfertaConConstructor;
    });
  }

  async aceptarOferta(expedienteId: string, ofertaId: string): Promise<void> {
    return this.ofertaRepo.aceptar(expedienteId, ofertaId);
  }

  async getExpedienteIdsConOferta(constructorId: string): Promise<Set<string>> {
    const ids = await this.ofertaRepo.findExpedienteIdsByConstructorId(constructorId);
    return new Set(ids);
  }

  async getOfertaPorExpediente(
    expedienteId:  string,
    constructorId: string,
  ): Promise<(OfertaForm & { id: string }) | null> {
    const data = await this.ofertaRepo.findByExpedienteIdAndConstructorId(expedienteId, constructorId);
    if (!data) return null;
    return {
      id:                data.id,
      precio:            data.precio,
      plazo_semanas_min: data.plazo_semanas_min,
      plazo_semanas_max: data.plazo_semanas_max,
      garantia_anos:     data.garantia_anos ?? null,
      fecha_inicio:      data.fecha_inicio  ?? '',
      descripcion:       data.descripcion,
    };
  }

  /**
   * Actualiza los datos de la oferta y, si se envía uno nuevo, reemplaza el
   * vídeo. Los documentos NO se tocan aquí: son varios por oferta y se añaden
   * con `agregarDocumentos` o se borran uno a uno.
   */
  async actualizar(
    ofertaId:      string,
    constructorId: string,
    form:          OfertaForm,
    videoFile:     File | null,
  ): Promise<void> {
    await this.ofertaRepo.update(ofertaId, form);
    if (!videoFile) return;

    // El vídeo sí es único por oferta: se sustituye el anterior.
    const existente = await this.archivoRepo.findByOfertaIdAndTipo(ofertaId, 'video');
    if (existente) {
      await this.archivoRepo.removeFromStorage([existente.url_storage]);
      await this.archivoRepo.deleteById(existente.id);
    }
    await this.subirArchivoOferta(ofertaId, constructorId, videoFile, 'video');
  }

  /** Sube un archivo al storage y lo registra; si el registro falla, deshace la subida. */
  private async subirArchivoOferta(
    ofertaId:      string,
    constructorId: string,
    file:          File,
    tipo:          'documento' | 'video',
    sufijo         = '',
  ): Promise<void> {
    const path = `ofertas/${ofertaId}/${tipo}/${Date.now()}${sufijo}_${file.name}`;
    await this.archivoRepo.uploadToStorage(path, file);
    try {
      await this.archivoRepo.insert({
        tipo,
        nombre_archivo: file.name,
        url_storage:    path,
        mime_type:      file.type || 'application/octet-stream',
        tamano_bytes:   file.size,
        subido_por:     constructorId,
        oferta_id:      ofertaId,
      });
    } catch (err) {
      await this.archivoRepo.removeFromStorage([path]);
      throw err;
    }
  }

  /**
   * Añade documentos conservando los existentes: una oferta admite varios
   * (la tabla `archivo` no tiene restricción única por oferta_id + tipo).
   */
  async agregarDocumentos(ofertaId: string, constructorId: string, files: File[]): Promise<void> {
    for (const [i, file] of files.entries()) {
      // El índice evita colisiones entre archivos homónimos subidos en el mismo ms.
      await this.subirArchivoOferta(ofertaId, constructorId, file, 'documento', `_${i}`);
    }
  }

  async getOferta(ofertaId: string): Promise<OfertaDetalle> {
    const data = await this.ofertaRepo.findById(ofertaId);

    const exp  = data.expediente;
    const loc  = Array.isArray(exp?.localizacion) ? exp!.localizacion : exp?.localizacion ?? null;
    const expedienteId = data.expediente_id;

    const estimacion = await this.estimacionRepo.findByExpedienteId(expedienteId);

    return {
      id:                    data.id,
      expediente_id:         expedienteId,
      precio:                data.precio,
      plazo_semanas_min:     data.plazo_semanas_min,
      plazo_semanas_max:     data.plazo_semanas_max,
      garantia_anos:         data.garantia_anos   ?? null,
      fecha_inicio:          data.fecha_inicio    ?? '',
      descripcion:           data.descripcion,
      estado:                data.estado,
      creado_en:             data.creado_en,
      expediente_numero:     exp?.numero                   ?? '—',
      servicio_nombre:       exp?.servicio?.nombre_es      ?? '—',
      servicio_nombre_en:    exp?.servicio?.nombre_en      ?? exp?.servicio?.nombre_es ?? '—',
      servicio_nombre_fr:    exp?.servicio?.nombre_fr      ?? exp?.servicio?.nombre_es ?? '—',
      direccion:             (loc as any)?.direccion  ?? '—',
      referencia:            (loc as any)?.referencia ?? '',
      provincia:             (loc as any)?.provincia  ?? '—',
      canton:                (loc as any)?.canton     ?? '—',
      distrito:              (loc as any)?.distrito   ?? '—',
      fecha_visita:          exp?.fecha_visita               ?? '',
      fecha_visita_real:     estimacion?.fecha_visita_real   ?? '',
      descripcion_problemas: estimacion?.descripcion_problemas ?? '',
      url_tour:              estimacion?.url_tour             ?? null,
    };
  }

  async getMisOfertasDashboard(constructorId: string): Promise<OfertaDashboard[]> {
    const rows = await this.ofertaRepo.findByConstructorIdConExpediente(constructorId);
    return rows.map(o => {
      const exp = o.expediente;
      const loc = Array.isArray(exp?.localizacion) ? exp!.localizacion : exp?.localizacion ?? null;
      return {
        id:                o.id,
        precio:            o.precio,
        fecha_inicio:      o.fecha_inicio      ?? '',
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        estado:            o.estado,
        creado_en:         o.creado_en,
        expediente_id:     (exp as any)?.id     ?? '',
        expediente_numero: exp?.numero           ?? '—',
        expediente_estado: (exp as any)?.estado  ?? '',
        servicio_nombre:   exp?.servicio?.nombre_es ?? '—',
        servicio_nombre_en: exp?.servicio?.nombre_en ?? exp?.servicio?.nombre_es ?? '—',
        servicio_nombre_fr: exp?.servicio?.nombre_fr ?? exp?.servicio?.nombre_es ?? '—',
        direccion:         (loc as any)?.direccion  ?? '—',
        referencia:        (loc as any)?.referencia ?? '',
        provincia:         (loc as any)?.provincia  ?? '—',
        canton:            (loc as any)?.canton     ?? '—',
        distrito:          (loc as any)?.distrito   ?? '—',
      } as OfertaDashboard;
    });
  }

  async getMisOfertas(constructorId: string): Promise<OfertaRow[]> {
    const rows = await this.ofertaRepo.findByConstructorIdConExpediente(constructorId);
    if (!rows.length) return [];

    // Miniatura del tour 3D (Matterport) por expediente de cada oferta.
    const expedienteIds = [...new Set(rows.map(o => o.expediente_id).filter(Boolean))];
    const estimaciones  = await this.estimacionRepo.findFechasByExpedienteIds(expedienteIds);
    const fotoPorExpediente = new Map<string, string>();
    for (const est of estimaciones) {
      const thumb = matterportThumbFromTour(est.url_tour);
      if (thumb) fotoPorExpediente.set(est.expediente_id, thumb);
    }

    return rows.map(o => {
      const exp = o.expediente;
      const loc = Array.isArray(exp?.localizacion) ? exp!.localizacion : exp?.localizacion ?? null;
      return {
        id:                o.id,
        precio:            o.precio,
        fecha_inicio:      o.fecha_inicio      ?? '',
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        estado:            o.estado,
        creado_en:         o.creado_en ?? '',
        expediente_numero:  exp?.numero                   ?? '—',
        servicio_nombre:    exp?.servicio?.nombre_es      ?? '—',
        servicio_nombre_en: exp?.servicio?.nombre_en      ?? exp?.servicio?.nombre_es ?? '—',
        servicio_nombre_fr: exp?.servicio?.nombre_fr      ?? exp?.servicio?.nombre_es ?? '—',
        direccion:         (loc as any)?.direccion  ?? '—',
        referencia:        (loc as any)?.referencia ?? '',
        provincia:         (loc as any)?.provincia  ?? '—',
        canton:            (loc as any)?.canton     ?? '—',
        distrito:          (loc as any)?.distrito   ?? '—',
        foto:              fotoPorExpediente.get(o.expediente_id) ?? null,
      } as OfertaRow;
    });
  }

  async enviar(
    expedienteId:    string,
    constructorId:   string,
    form:            OfertaForm,
    documentoFiles:  File[],
    videoFile:       File | null,
  ): Promise<void> {
    const ofertaId = await this.ofertaRepo.insert({
      expediente_id:     expedienteId,
      constructor_id:    constructorId,
      precio:            form.precio!,
      plazo_semanas_min: form.plazo_semanas_min,
      plazo_semanas_max: form.plazo_semanas_max,
      garantia_anos:     form.garantia_anos ?? null,
      fecha_inicio:      form.fecha_inicio  || null,
      descripcion:       form.descripcion,
      estado:            'pendiente',
    });

    if (documentoFiles.length) {
      await this.agregarDocumentos(ofertaId, constructorId, documentoFiles);
    }
    if (videoFile) {
      await this.subirArchivoOferta(ofertaId, constructorId, videoFile, 'video');
    }

    await this.ofertaRepo.updateEstadoExpedienteEnOferta(expedienteId);
  }

  async eliminarOferta(ofertaId: string, expedienteId: string): Promise<void> {
    const archivos = await this.archivoRepo.findByOfertaId(ofertaId);
    const paths = archivos.map(a => a.url_storage);
    if (paths.length) await this.archivoRepo.removeFromStorage(paths);
    await this.archivoRepo.deleteByOfertaId(ofertaId);
    // RPC: borra el contrato FK (si existe), la oferta y ajusta el estado del expediente
    await this.ofertaRepo.eliminarConCascada(ofertaId, expedienteId);
  }
}
