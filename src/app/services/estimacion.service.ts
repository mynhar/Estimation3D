import { Injectable, inject } from '@angular/core';
import { EstimacionDetalle } from '../models';
import { EstimacionRepository } from '../data';

@Injectable({ providedIn: 'root' })
export class EstimacionService {
  private estimacionRepo = inject(EstimacionRepository);

  static parseUrls(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch {}
    return [raw];
  }

  static serializeUrls(urls: string[]): string | null {
    const filtered = urls.filter(Boolean);
    return filtered.length ? JSON.stringify(filtered) : null;
  }

  async get(expedienteId: string): Promise<EstimacionDetalle | null> {
    const data = await this.estimacionRepo.findByExpedienteId(expedienteId);
    if (!data) return null;
    return {
      fecha_visita_real:     data.fecha_visita_real     ?? '',
      descripcion_problemas: data.descripcion_problemas,
      costo_estimado:        data.costo_estimado        ?? null,
      costo_estimado_max:    data.costo_estimado_max    ?? null,
      notas_internas:        data.notas_internas        ?? '',
      url_tour:              data.url_tour              ?? null,
    };
  }

  async eliminar(expedienteId: string): Promise<void> {
    return this.estimacionRepo.delete(expedienteId);
  }

  async actualizarUrlTour(expedienteId: string, urlTour: string | null): Promise<void> {
    return this.estimacionRepo.updateUrlTour(expedienteId, urlTour);
  }

  async actualizarUrlsTour(expedienteId: string, urls: string[]): Promise<void> {
    return this.estimacionRepo.updateUrlTour(
      expedienteId,
      EstimacionService.serializeUrls(urls),
    );
  }

  async getMontoTotalPorEstimador(estimadorId: string): Promise<number> {
    const costos = await this.estimacionRepo.findCostosByEstimadorId(estimadorId);
    return costos.reduce((sum, v) => sum + v, 0);
  }

  async guardar(
    expedienteId: string,
    estimadorId:  string,
    data: {
      fechaVisita:          string;
      horaVisita:           string;
      descripcionProblemas: string;
      costoMin:             number | null;
      costoMax:             number | null;
      notasInternas:        string;
      urlTour:              string | null;
    },
  ): Promise<void> {
    return this.estimacionRepo.upsert(expedienteId, estimadorId, {
      fecha_visita_real:     `${data.fechaVisita}T${data.horaVisita}:00`,
      descripcion_problemas: data.descripcionProblemas,
      costo_estimado:        data.costoMin,
      costo_estimado_max:    data.costoMax,
      notas_internas:        data.notasInternas || null,
      url_tour:              data.urlTour       || null,
    });
  }
}
