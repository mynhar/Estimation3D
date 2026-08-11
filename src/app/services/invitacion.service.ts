import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthSupabaseService } from './auth-supabase.service';
import { InvitacionRepository } from '../data/invitacion.repository';
import { edgeError } from './edge-error.service';

/**
 * Invitación de constructores a un expediente: la edge function
 * `enviar-invitacion` envía el correo y registra las invitaciones
 * (solo los constructores invitados ven el expediente y pueden ofertar).
 */
@Injectable({ providedIn: 'root' })
export class InvitacionService {
  private auth = inject(AuthSupabaseService);
  private repo = inject(InvitacionRepository);

  getConstructorIdsInvitados(expedienteId: string): Promise<Set<string>> {
    return this.repo.findConstructorIds(expedienteId);
  }

  /** Ids de expedientes a los que el constructor fue invitado por correo. */
  getExpedienteIdsInvitadoPorCorreo(constructorId: string): Promise<Set<string>> {
    return this.repo.findExpedienteIdsInvitadoPorCorreo(constructorId);
  }

  /** Envía la invitación por correo. Devuelve cuántos correos se enviaron. */
  async enviarInvitaciones(expedienteId: string, constructorIds: string[]): Promise<number> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/enviar-invitacion`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.auth.getAccessToken()}`,
      },
      body: JSON.stringify({ expediente_id: expedienteId, constructor_ids: constructorIds }),
    });
    // Se propaga el código, no el texto: el mensaje de la función está solo en
    // español y lo traduce el componente con `EdgeErrorService`.
    if (!res.ok) throw await edgeError(res);
    const payload = await res.json().catch(() => ({} as Record<string, number>));
    return payload['enviados'] ?? constructorIds.length;
  }
}
