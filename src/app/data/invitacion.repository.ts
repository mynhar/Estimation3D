import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

@Injectable({ providedIn: 'root' })
export class InvitacionRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Ids de los constructores ya invitados a un expediente. */
  async findConstructorIds(expedienteId: string): Promise<Set<string>> {
    const { data, error } = await this.db
      .from('expediente_invitacion')
      .select('constructor_id')
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map(r => r.constructor_id));
  }

  /**
   * Retira las invitaciones por correo de un expediente. Sin ninguna fila con
   * `invitado_por NOT NULL`, `constructor_puede_ver_expediente()` lo considera
   * de nuevo **público**: lo ve y puede ofertar cualquier constructor.
   *
   * Las filas del backfill (`invitado_por IS NULL`, constructores que ya habían
   * ofertado) se conservan a propósito: solo conceden acceso, nunca restringen.
   */
  async eliminarInvitacionesPorCorreo(expedienteId: string): Promise<void> {
    const { error } = await this.db
      .from('expediente_invitacion')
      .delete()
      .eq('expediente_id', expedienteId)
      .not('invitado_por', 'is', null);
    if (error) throw new Error(error.message);
  }

  /**
   * Ids de expedientes a los que el constructor fue invitado por correo.
   * `invitado_por IS NOT NULL` distingue la invitación enviada por el admin
   * del backfill histórico (visibilidad heredada por ofertas previas).
   */
  async findExpedienteIdsInvitadoPorCorreo(constructorId: string): Promise<Set<string>> {
    const { data, error } = await this.db
      .from('expediente_invitacion')
      .select('expediente_id')
      .eq('constructor_id', constructorId)
      .not('invitado_por', 'is', null);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map(r => r.expediente_id));
  }
}
