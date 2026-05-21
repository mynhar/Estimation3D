import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export type ServicioNombres = {
  id: number;
  nombre_es: string;
  nombre_en: string | null;
  nombre_fr: string | null;
};

export type ServicioCompleto = ServicioNombres & {
  descripcion_es: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
};

@Injectable({ providedIn: 'root' })
export class ServicioRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findById(id: number): Promise<ServicioCompleto | null> {
    const { data, error } = await this.db
      .from('servicio')
      .select('id, nombre_es, nombre_en, nombre_fr, descripcion_es, descripcion_en, descripcion_fr')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data as ServicioCompleto;
  }

  async findByIds(ids: number[]): Promise<ServicioNombres[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('servicio')
      .select('id, nombre_es, nombre_en, nombre_fr')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as ServicioNombres[];
  }

  async findByIdsCompleto(ids: number[]): Promise<ServicioCompleto[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('servicio')
      .select('id, nombre_es, nombre_en, nombre_fr, descripcion_es, descripcion_en, descripcion_fr')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as ServicioCompleto[];
  }
}
