import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthSupabaseService } from './auth-supabase.service';
import { edgeError } from './edge-error.service';

export type ChatRol = 'user' | 'assistant';

export interface ChatMensaje {
  role:    ChatRol;
  content: string;
}

export interface RespuestaAsistente {
  reply:    string | null;
  refusal?: boolean;
}

/**
 * Cliente del Asistente IA. Envía el historial de chat + el expediente
 * seleccionado a la función de borde `asistente-ia`, que reúne los datos reales
 * del expediente y consulta a Claude. La clave de la API nunca toca el frontend.
 */
@Injectable({ providedIn: 'root' })
export class AsistenteIaService {
  private auth = inject(AuthSupabaseService);

  async preguntar(
    expedienteId: string,
    messages:     ChatMensaje[],
    lang:         string,
  ): Promise<RespuestaAsistente> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/asistente-ia`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.auth.getAccessToken()}`,
      },
      body: JSON.stringify({ expedienteId, messages, lang }),
    });

    // Se propaga el código, no el texto: el mensaje de la función está solo en
    // español y lo traduce el componente con `EdgeErrorService`.
    if (!res.ok) throw await edgeError(res);
    return res.json() as Promise<RespuestaAsistente>;
  }

  /** Carga el historial persistido de la conversación de un expediente (RLS: solo el propio). */
  async cargarHistorial(expedienteId: string): Promise<ChatMensaje[]> {
    const { data, error } = await this.auth.client
      .from('asistente_conversacion')
      .select('role, content')
      .eq('expediente_id', expedienteId)
      .order('creado_en', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMensaje[];
  }

  /** Borra el historial persistido de la conversación de un expediente. */
  async limpiarHistorial(expedienteId: string): Promise<void> {
    const { error } = await this.auth.client
      .from('asistente_conversacion')
      .delete()
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }
}
