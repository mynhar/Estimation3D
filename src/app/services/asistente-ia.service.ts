import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthSupabaseService } from './auth-supabase.service';

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

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(payload.error ?? `Error ${res.status}`);
    }
    return res.json() as Promise<RespuestaAsistente>;
  }
}
