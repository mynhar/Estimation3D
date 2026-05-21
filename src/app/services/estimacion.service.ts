import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { EstimacionDetalle } from '../models';

@Injectable({ providedIn: 'root' })
export class EstimacionService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

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
    const { data, error } = await this.db
      .from('estimacion')
      .select('fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max, notas_internas, url_tour')
      .eq('expediente_id', expedienteId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data)  return null;

    return {
      fecha_visita_real:     data.fecha_visita_real     ?? '',
      descripcion_problemas: data.descripcion_problemas ?? '',
      costo_estimado:        data.costo_estimado        ?? null,
      costo_estimado_max:    data.costo_estimado_max    ?? null,
      notas_internas:        data.notas_internas        ?? '',
      url_tour:              data.url_tour              ?? null,
    };
  }

  async eliminar(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .delete()
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async actualizarUrlTour(expedienteId: string, urlTour: string | null): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .update({ url_tour: urlTour })
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async actualizarUrlsTour(expedienteId: string, urls: string[]): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .update({ url_tour: EstimacionService.serializeUrls(urls) })
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async guardar(
    expedienteId: string,
    estimadorId: string,
    data: {
      fechaVisita: string;
      horaVisita: string;
      descripcionProblemas: string;
      costoMin: number | null;
      costoMax: number | null;
      notasInternas: string;
      urlTour: string | null;
    }
  ): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .upsert({
        expediente_id:         expedienteId,
        estimador_id:          estimadorId,
        fecha_visita_real:     `${data.fechaVisita}T${data.horaVisita}:00`,
        descripcion_problemas: data.descripcionProblemas,
        costo_estimado:        data.costoMin,
        costo_estimado_max:    data.costoMax,
        notas_internas:        data.notasInternas || null,
        url_tour:              data.urlTour       || null,
      }, { onConflict: 'expediente_id' });

    if (error) throw new Error(error.message);
  }
}
