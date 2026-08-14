import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthSupabaseService } from './auth-supabase.service';
import { InvitacionRepository } from '../data/invitacion.repository';
import { edgeError } from './edge-error.service';

/** Constructor cuyo correo no salió, con el motivo técnico de Resend. */
export interface ErrorEnvio {
  constructor_id: string;
  detalle:        string;
}

/** Resultado de `enviarInvitaciones()`: el envío puede ser parcial. */
export interface EnvioInvitaciones {
  enviados: number;
  fallidos: number;
  errores:  ErrorEnvio[];
}

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

  /**
   * Abre el expediente a **todos** los constructores: retira las invitaciones
   * por correo, con lo que vuelve a ser público (lo ve cualquier constructor
   * activo, con el tope de 5 ofertas del modelo público).
   */
  abrirATodosLosConstructores(expedienteId: string): Promise<void> {
    return this.repo.eliminarInvitacionesPorCorreo(expedienteId);
  }

  /** Ids de expedientes a los que el constructor fue invitado por correo. */
  getExpedienteIdsInvitadoPorCorreo(constructorId: string): Promise<Set<string>> {
    return this.repo.findExpedienteIdsInvitadoPorCorreo(constructorId);
  }

  /**
   * Envía la invitación por correo, un mensaje por constructor y en el idioma
   * de cada uno.
   *
   * `passwords` es opcional y va por constructor: la contraseña guardada no se
   * puede leer (está hasheada), así que mandar una implica *fijarla*. Si no se
   * escribe ninguna, el correo no lleva contraseña y el constructor entra con
   * la suya de siempre.
   */
  async enviarInvitaciones(
    expedienteId: string,
    constructorIds: string[],
    passwords: Record<string, string> = {},
  ): Promise<EnvioInvitaciones> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/enviar-invitacion`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.auth.getAccessToken()}`,
      },
      body: JSON.stringify({
        expediente_id:   expedienteId,
        constructor_ids: constructorIds,
        passwords,
      }),
    });
    // Se propaga el código, no el texto: el mensaje de la función está solo en
    // español y lo traduce el componente con `EdgeErrorService`.
    if (!res.ok) throw await edgeError(res);
    const payload = await res.json().catch(() => ({} as Record<string, unknown>));
    return {
      enviados: (payload['enviados'] as number) ?? constructorIds.length,
      fallidos: (payload['fallidos'] as number) ?? 0,
      errores:  (payload['errores'] as ErrorEnvio[]) ?? [],
    };
  }
}
