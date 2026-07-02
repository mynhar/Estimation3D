import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { ActividadServicio } from '../models/seguimiento.model';

/** Campos escribibles al crear/actualizar una actividad (sin id autogenerado). */
export type ActividadServicioInput = Omit<ActividadServicio, 'id'>;

/**
 * Acceso a datos de `actividad_servicio` para el mantenimiento (admin).
 * A diferencia de `SeguimientoRepository.findActividadesByServicioId` (que solo
 * lee las actividades activas para el reporte diario), aquí se listan TODAS las
 * actividades y se exponen las operaciones de escritura.
 */
@Injectable({ providedIn: 'root' })
export class ActividadServicioRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Todas las actividades de un servicio (activas e inactivas), ordenadas por código. */
  async findByServicio(servicioId: number): Promise<ActividadServicio[]> {
    const { data, error } = await this.db
      .from('actividad_servicio')
      .select('*')
      .eq('servicio_id', servicioId)
      .order('codigo', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ActividadServicio[];
  }

  /** Crea una actividad y devuelve la fila insertada. */
  async crear(input: ActividadServicioInput): Promise<ActividadServicio> {
    const { data, error } = await this.db
      .from('actividad_servicio')
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ActividadServicio;
  }

  /** Actualiza una actividad y devuelve la fila resultante. */
  async actualizar(id: string, cambios: Partial<ActividadServicioInput>): Promise<ActividadServicio> {
    const { data, error } = await this.db
      .from('actividad_servicio')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ActividadServicio;
  }

  /** Elimina una actividad por id. */
  async eliminar(id: string): Promise<void> {
    const { error } = await this.db
      .from('actividad_servicio')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
