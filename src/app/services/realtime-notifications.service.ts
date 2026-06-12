import { inject, Injectable, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { RolUsuario } from '../types/supabase';
import { AuthSupabaseService } from './auth-supabase.service';
import { ToastService } from './toast.service';

type ExpRow = { id: string; estado: string; numero: string };
type OfeRow = { id: string; estado: string; expediente_id: string };
type CtrRow = { id: string; estado: string; expediente_id: string };

@Injectable({ providedIn: 'root' })
export class RealtimeNotificationsService implements OnDestroy {
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);

  private channels: RealtimeChannel[] = [];

  /**
   * Inicia las suscripciones Realtime según el rol del usuario.
   * Llama a detener() antes de suscribir para evitar canales duplicados.
   */
  iniciar(userId: string, rol: RolUsuario): void {
    this.detener();

    if (rol === 'cliente') {
      this.channels.push(this.chanExpedienteCliente(userId));
      this.channels.push(this.chanContratoCliente(userId));
    }
    if (rol === 'estimador') {
      this.channels.push(this.chanExpedienteEstimador(userId));
    }
    if (rol === 'constructor') {
      this.channels.push(this.chanOfertaConstructor(userId));
    }
    // administrador: sin notificaciones personales (tiene dashboards completos)
  }

  detener(): void {
    for (const ch of this.channels) {
      this.auth.client.removeChannel(ch);
    }
    this.channels = [];
  }

  ngOnDestroy(): void {
    this.detener();
  }

  // ── Canales ──────────────────────────────────────────────────────────────────

  private chanExpedienteCliente(userId: string): RealtimeChannel {
    return this.auth.client
      .channel(`exp-cli-${userId}`)
      .on<ExpRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'expediente', filter: `cliente_id=eq.${userId}` },
        payload => this.onExpedienteUpdate(payload),
      )
      .subscribe();
  }

  private chanContratoCliente(userId: string): RealtimeChannel {
    return this.auth.client
      .channel(`ctr-cli-${userId}`)
      .on<CtrRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contrato', filter: `cliente_id=eq.${userId}` },
        payload => this.onContratoUpdate(payload),
      )
      .subscribe();
  }

  private chanExpedienteEstimador(userId: string): RealtimeChannel {
    return this.auth.client
      .channel(`exp-est-${userId}`)
      .on<ExpRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'expediente', filter: `estimador_id=eq.${userId}` },
        payload => this.onExpedienteAsignado(payload),
      )
      .subscribe();
  }

  private chanOfertaConstructor(userId: string): RealtimeChannel {
    return this.auth.client
      .channel(`ofe-con-${userId}`)
      .on<OfeRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'oferta', filter: `constructor_id=eq.${userId}` },
        payload => this.onOfertaUpdate(payload),
      )
      .subscribe();
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  private onExpedienteUpdate(payload: RealtimePostgresChangesPayload<ExpRow>): void {
    // payload.new es T | {} — casteamos porque solo nos suscribimos a UPDATE
    const nuevo = payload.new as ExpRow;
    const viejo = payload.old as Partial<ExpRow>;

    if (!nuevo.estado) return;
    // Si REPLICA IDENTITY FULL está activo, viejo.estado está disponible.
    // Si el estado no cambió, no notificar.
    if (viejo.estado && nuevo.estado === viejo.estado) return;

    const numero = nuevo.numero ?? '';
    const key    = `realtime.exp_${nuevo.estado}`;
    const raw    = this.translate.instant(key, { numero });
    // Si la clave no existe, ngx-translate devuelve la clave misma → usar fallback
    const msg    = raw === key
      ? this.translate.instant('realtime.exp_cambio', { numero, estado: nuevo.estado })
      : raw;

    const type = nuevo.estado === 'cancelado' ? 'warning' : 'info';
    this.toast.show(msg, type, 9000);
  }

  private onExpedienteAsignado(payload: RealtimePostgresChangesPayload<ExpRow>): void {
    const nuevo  = payload.new as ExpRow;
    const numero = nuevo.numero ?? '';
    const msg    = this.translate.instant('realtime.exp_asignado_estimador', { numero });
    this.toast.show(msg, 'info', 9000);
  }

  private onContratoUpdate(payload: RealtimePostgresChangesPayload<CtrRow>): void {
    const nuevo = payload.new as CtrRow;
    const viejo = payload.old as Partial<CtrRow>;

    if (!nuevo.estado) return;
    // Si REPLICA IDENTITY FULL está activo, viejo.estado está disponible.
    // Solo notificar cuando el estado realmente cambió.
    if (viejo.estado && nuevo.estado === viejo.estado) return;

    // Por ahora solo interesa el arranque de la obra (firmado → en_ejecucion).
    if (nuevo.estado !== 'en_ejecucion') return;

    this.toast.show(this.translate.instant('realtime.contrato_en_ejecucion'), 'success', 9000);
  }

  private onOfertaUpdate(payload: RealtimePostgresChangesPayload<OfeRow>): void {
    const nuevo = payload.new as OfeRow;
    const viejo = payload.old as Partial<OfeRow>;

    if (!nuevo.estado) return;
    if (viejo.estado && nuevo.estado === viejo.estado) return;

    const key  = `realtime.ofe_${nuevo.estado}`;
    const msg  = this.translate.instant(key);
    const type = nuevo.estado === 'rechazada' ? 'warning' : 'success';
    this.toast.show(msg, type, 9000);
  }
}
