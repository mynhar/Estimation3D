import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export type ContratoHistorialItem = {
  id:             string;
  estado:         string;
  generado_en:    string;
  firmado_en:     string | null;
  actualizado_en: string;
  oferta:         { fecha_inicio: string | null } | null;
};

@Injectable({ providedIn: 'root' })
export class ContratoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findHistorialByExpedienteId(expedienteId: string): Promise<ContratoHistorialItem | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, estado, generado_en, firmado_en, actualizado_en, oferta(fecha_inicio)')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) return null;
    return data as ContratoHistorialItem | null;
  }
}
