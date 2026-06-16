import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export type EstimacionRaw = {
  expediente_id:         string;
  estimador_id:          string | null;
  fecha_visita_real:     string | null;
  descripcion_problemas: string;
  costo_estimado:        number | null;
  costo_estimado_max:    number | null;
  notas_internas:        string | null;
  url_tour:              string | null;
};

export type EstimacionMin = {
  expediente_id:      string;
  costo_estimado:     number | null;
  costo_estimado_max: number | null;
};

export type EstimacionFecha = {
  expediente_id:     string;
  fecha_visita_real: string | null;
};

export type EstimacionSummary = {
  expediente_id:      string;
  fecha_visita_real:  string | null;
  costo_estimado:     number | null;
  costo_estimado_max: number | null;
};

@Injectable({ providedIn: 'root' })
export class EstimacionRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findByExpedienteId(expedienteId: string): Promise<EstimacionRaw | null> {
    const { data, error } = await this.db
      .from('estimacion')
      .select('expediente_id, estimador_id, fecha_visita_real, descripcion_problemas, costo_estimado, costo_estimado_max, notas_internas, url_tour')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as EstimacionRaw | null;
  }

  async findMinByExpedienteIds(ids: string[]): Promise<EstimacionMin[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('estimacion')
      .select('expediente_id, costo_estimado, costo_estimado_max')
      .in('expediente_id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as EstimacionMin[];
  }

  async findFechasByExpedienteIds(ids: string[]): Promise<EstimacionFecha[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('estimacion')
      .select('expediente_id, fecha_visita_real')
      .in('expediente_id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as EstimacionFecha[];
  }

  async findSummaryByExpedienteIds(ids: string[]): Promise<EstimacionSummary[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('estimacion')
      .select('expediente_id, fecha_visita_real, costo_estimado, costo_estimado_max')
      .in('expediente_id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as EstimacionSummary[];
  }

  async upsert(
    expedienteId: string,
    estimadorId:  string,
    payload: {
      fecha_visita_real:     string;
      descripcion_problemas: string;
      costo_estimado:        number | null;
      costo_estimado_max:    number | null;
      notas_internas:        string | null;
      url_tour:              string | null;
    },
  ): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .upsert(
        { expediente_id: expedienteId, estimador_id: estimadorId, ...payload },
        { onConflict: 'expediente_id' },
      );
    if (error) throw new Error(error.message);
  }

  async updateUrlTour(expedienteId: string, urlTour: string | null): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .update({ url_tour: urlTour })
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }

  async findCostosByEstimadorId(estimadorId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from('estimacion')
      .select('costo_estimado')
      .eq('estimador_id', estimadorId)
      .not('costo_estimado', 'is', null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { costo_estimado: number | null }) => r.costo_estimado ?? 0);
  }

  async delete(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .delete()
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }
}
