import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { TablesInsert } from '../types/supabase';

/**
 * Lista completa de servicios de un expediente. El principal
 * (`expediente.servicio_id`) lo inserta un trigger en el alta; aquí solo se
 * escriben los adicionales. Ver `20261014_expediente_servicio.sql` y
 * `20261014b_expediente_servicio_guardar.sql`.
 */
@Injectable({ providedIn: 'root' })
export class ExpedienteServicioRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findServicioIds(expedienteId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from('expediente_servicio')
      .select('servicio_id')
      .eq('expediente_id', expedienteId)
      .order('creado_en');
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => r.servicio_id);
  }

  /**
   * Sustituye la lista entera de forma atómica (RPC). `servicioIds[0]` pasa a
   * ser el principal. Solo administrador.
   */
  async guardar(expedienteId: string, servicioIds: number[]): Promise<void> {
    const { error } = await this.db.rpc('guardar_servicios_expediente', {
      p_expediente_id: expedienteId,
      p_servicios:     servicioIds,
    });
    // Quitar un servicio que ya tiene ofertas: el motivo se le enseña al usuario.
    if (error?.hint === 'servicio_con_ofertas') throw new Error('service_selector.err_with_offers');
    if (error) throw new Error(error.message);
  }

  async insertMany(expedienteId: string, servicioIds: number[]): Promise<void> {
    if (!servicioIds.length) return;
    const rows: TablesInsert<'expediente_servicio'>[] = servicioIds.map(servicio_id => ({
      expediente_id: expedienteId,
      servicio_id,
    }));
    const { error } = await this.db
      .from('expediente_servicio')
      .insert(rows);
    if (error) throw new Error(error.message);
  }
}
