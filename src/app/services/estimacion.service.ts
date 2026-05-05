import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { EstimacionDetalle } from '../models';

@Injectable({ providedIn: 'root' })
export class EstimacionService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async get(expedienteId: string): Promise<EstimacionDetalle | null> {
    const { data, error } = await this.db
      .from('estimacion')
      .select('fecha_visita_real, descripcion_problemas, costo_estimado, notas_internas')
      .eq('expediente_id', expedienteId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data)  return null;

    return {
      fecha_visita_real:     data.fecha_visita_real     ?? '',
      descripcion_problemas: data.descripcion_problemas ?? '',
      costo_estimado:        data.costo_estimado        ?? null,
      notas_internas:        data.notas_internas        ?? '',
    };
  }

  async guardar(
    expedienteId: string,
    estimadorId: string,
    data: {
      fechaVisita: string;
      horaVisita: string;
      descripcionProblemas: string;
      costoEstimado: number;
      notasInternas: string;
    }
  ): Promise<void> {
    const { error } = await this.db
      .from('estimacion')
      .upsert({
        expediente_id:         expedienteId,
        estimador_id:          estimadorId,
        fecha_visita_real:     `${data.fechaVisita}T${data.horaVisita}:00`,
        descripcion_problemas: data.descripcionProblemas,
        costo_estimado:        data.costoEstimado,
        notas_internas:        data.notasInternas || null,
      }, { onConflict: 'expediente_id' });

    if (error) throw new Error(error.message);
  }
}
