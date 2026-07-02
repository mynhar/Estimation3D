import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { FaseServicio } from '../models/seguimiento.model';

/** Campos escribibles al crear/actualizar una fase (sin id autogenerado). */
export type FaseServicioInput = Omit<FaseServicio, 'id'>;

/**
 * Acceso a datos de `fase_servicio` para el mantenimiento (admin).
 * A diferencia de `SeguimientoRepository.findFasesByServicioId` (que solo lee
 * las fases activas para el seguimiento de obra), aquí se listan TODAS las fases
 * y se exponen las operaciones de escritura.
 */
@Injectable({ providedIn: 'root' })
export class FaseServicioRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Todas las fases de un servicio (activas e inactivas), ordenadas por `orden`. */
  async findByServicio(servicioId: number): Promise<FaseServicio[]> {
    const { data, error } = await this.db
      .from('fase_servicio')
      .select('*')
      .eq('servicio_id', servicioId)
      .order('orden', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as FaseServicio[];
  }

  /** Crea una fase y devuelve la fila insertada. */
  async crear(input: FaseServicioInput): Promise<FaseServicio> {
    const { data, error } = await this.db
      .from('fase_servicio')
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as FaseServicio;
  }

  /** Actualiza una fase y devuelve la fila resultante. */
  async actualizar(id: string, cambios: Partial<FaseServicioInput>): Promise<FaseServicio> {
    const { data, error } = await this.db
      .from('fase_servicio')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as FaseServicio;
  }

  /** Elimina una fase por id. */
  async eliminar(id: string): Promise<void> {
    const { error } = await this.db
      .from('fase_servicio')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
