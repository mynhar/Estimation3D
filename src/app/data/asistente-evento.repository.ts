import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export type TipoEvento =
  | 'salud_mencionada'
  | 'escalada_humana'
  | 'caso_externo'
  | 'evidencia_incompleta_imprevisto'
  | 'imprevisto_anticipado'
  | 'candidato_imprevisto';

export interface AsistenteEvento {
  id:            string;
  expediente_id: string;
  usuario_id:    string;
  rol:           string;
  tipo:          TipoEvento;
  resumen:       string;
  payload:       Record<string, unknown>;
  resuelto:      boolean;
  creado_en:     string;
  // Relaciones embebidas (PostgREST).
  expediente:    { numero: string } | null;
  usuario:       { nombre: string; apellido: string } | null;
}

/** Acceso a datos de `asistente_evento` (eventos de escalación del asistente, admin). */
@Injectable({ providedIn: 'root' })
export class AsistenteEventoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Todos los eventos, más recientes primero, con expediente y usuario embebidos. */
  async findAll(): Promise<AsistenteEvento[]> {
    const { data, error } = await this.db
      .from('asistente_evento')
      .select(`
        id, expediente_id, usuario_id, rol, tipo, resumen, payload, resuelto, creado_en,
        expediente:expediente_id ( numero ),
        usuario:usuario_id ( nombre, apellido )
      `)
      .order('creado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AsistenteEvento[];
  }

  /** Marca un evento como resuelto (o no) y devuelve su nuevo estado. */
  async marcarResuelto(id: string, resuelto: boolean): Promise<void> {
    const { error } = await this.db
      .from('asistente_evento')
      .update({ resuelto })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
