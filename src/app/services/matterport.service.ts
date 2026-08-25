import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthSupabaseService } from './auth-supabase.service';
import { MatterportRepository } from '../data/matterport.repository';
import { MatterportModelo, MatterportSincronizacion } from '../models/matterport.model';
import { edgeError } from './edge-error.service';

/**
 * Ficha de la propiedad escaneada (Matterport).
 *
 * La lectura sale de `matterport_modelo`; la sincronización la hace la edge
 * function `matterport-sync`, que es la única que conoce las credenciales de la
 * Model API y la única que escribe en la tabla.
 */
@Injectable({ providedIn: 'root' })
export class MatterportService {
  private auth = inject(AuthSupabaseService);
  private repo = inject(MatterportRepository);

  /** Ficha guardada de un expediente (una entrada por tour). */
  getPorExpediente(expedienteId: string): Promise<MatterportModelo[]> {
    return this.repo.findByExpedienteId(expedienteId);
  }

  /** Fichas de varios expedientes, agrupadas por expediente. */
  async getPorExpedientes(ids: string[]): Promise<Map<string, MatterportModelo[]>> {
    const filas = await this.repo.findByExpedienteIds(ids);
    const mapa = new Map<string, MatterportModelo[]>();
    for (const fila of filas) {
      const lista = mapa.get(fila.expediente_id);
      if (lista) lista.push(fila);
      else mapa.set(fila.expediente_id, [fila]);
    }
    return mapa;
  }

  /**
   * Vuelve a pedir a Matterport la ficha de todos los tours del expediente y la
   * guarda. Devuelve el recuento porque el resultado puede ser parcial: un tour
   * de otra organización, o borrado en Matterport, falla sin tumbar los demás.
   */
  async sincronizar(expedienteId: string): Promise<MatterportSincronizacion> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/matterport-sync`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.auth.getAccessToken()}`,
      },
      body: JSON.stringify({ expediente_id: expedienteId }),
    });
    // Se propaga el código, no el texto: el mensaje de la función está solo en
    // español y lo traduce el componente con `EdgeErrorService`.
    if (!res.ok) throw await edgeError(res);
    const payload = await res.json().catch(() => ({} as Record<string, unknown>));
    return {
      sincronizados: (payload['sincronizados'] as number) ?? 0,
      fallidos:      (payload['fallidos']      as number) ?? 0,
      errores:       (payload['errores']       as MatterportSincronizacion['errores']) ?? [],
    };
  }
}
