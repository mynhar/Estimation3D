import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { MatterportModelo } from '../models/matterport.model';

/** Columnas de la ficha; `datos_crudos` queda fuera a propósito (pesa y no se muestra). */
const COLUMNAS = `
  id, expediente_id, model_id, url_tour,
  nombre, descripcion, estado, visibilidad,
  direccion, calle, ciudad, region, codigo_postal, pais, latitud, longitud,
  area_piso_m2, area_piso_interior_m2, area_pared_m2, area_techo_m2,
  volumen_m3, alto_m, ancho_m, profundidad_m,
  area_piso_ft2, area_piso_interior_ft2,
  total_pisos, total_habitaciones, pisos, habitaciones,
  imagen_url, share_url, publicado, resumen_publico,
  creado_matterport, modificado_matterport, sincronizado_en
`;

/**
 * Lectura de `matterport_modelo`. La escritura es exclusiva de la edge function
 * `matterport-sync` (service role): la tabla no tiene políticas de escritura
 * para `authenticated`, así que aquí solo hay consultas.
 */
@Injectable({ providedIn: 'root' })
export class MatterportRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Modelos de un expediente, en el orden en que se sincronizaron. */
  async findByExpedienteId(expedienteId: string): Promise<MatterportModelo[]> {
    const { data, error } = await this.db
      .from('matterport_modelo')
      .select(COLUMNAS)
      .eq('expediente_id', expedienteId)
      .order('creado_en', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MatterportModelo[];
  }

  /** Modelos de varios expedientes, para las listas. */
  async findByExpedienteIds(ids: string[]): Promise<MatterportModelo[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('matterport_modelo')
      .select(COLUMNAS)
      .in('expediente_id', ids)
      .order('creado_en', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MatterportModelo[];
  }
}
