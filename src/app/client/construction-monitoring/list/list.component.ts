import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ContratoService } from '../../../services/contrato.service';
import { ObraVmService } from '../../../services/obra-vm.service';
import { ObraVM } from '../../../models';
import { ObraCardComponent } from '../../../shared/construction-monitoring/obra-card.component';

// Estados de contrato que tienen seguimiento de obra visible para el cliente.
const ESTADOS_OBRA = ['firmado', 'en_ejecucion', 'completado'];

@Component({
  selector: 'app-client-construction-monitoring-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ObraCardComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class ClientConstructionMonitoringListComponent implements OnInit, OnDestroy {
  private auth            = inject(AuthSupabaseService);
  private contratoService = inject(ContratoService);
  private obraVm          = inject(ObraVmService);

  private user = toSignal(this.auth.user$);

  obras    = signal<ObraVM[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  // Realtime: refresco en vivo al arrancar la obra o registrarse un parte.
  private channels: RealtimeChannel[] = [];
  private reporteChannel: RealtimeChannel | null = null;
  private reporteSegKey = '';
  private recargaTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }

    await this.cargar(userId, true);
    this.suscribirContrato(userId);
    this.sincronizarCanalReportes(userId);
  }

  ngOnDestroy(): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    for (const ch of this.channels) this.auth.client.removeChannel(ch);
    this.channels = [];
    if (this.reporteChannel) {
      this.auth.client.removeChannel(this.reporteChannel);
      this.reporteChannel = null;
    }
  }

  private async cargar(userId: string, mostrarSpinner: boolean): Promise<void> {
    if (mostrarSpinner) this.cargando.set(true);
    try {
      const contratos = await this.contratoService.getMisContratos(userId);
      const conObra   = contratos.filter(c => ESTADOS_OBRA.includes(c.estado));

      const vms = await this.obraVm.construirObras(conObra);
      this.obras.set(
        vms.sort((a, b) => b.ultimaActualizacion.localeCompare(a.ultimaActualizacion)),
      );
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mostrarSpinner) this.cargando.set(false);
    }
  }

  // ── Realtime ────────────────────────────────────────────────────────────────

  // Cambios de estado del contrato (p. ej. arranque firmado → en_ejecucion,
  // o completado / cancelado, que añaden o quitan obras de la lista).
  private suscribirContrato(userId: string): void {
    this.channels.push(
      this.auth.client
        .channel(`cm-list-ctr-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'contrato', filter: `cliente_id=eq.${userId}` },
          () => this.programarRecarga(userId),
        )
        .subscribe(),
    );
  }

  // Partes diarios: el canal se acota a los seguimiento_id de las obras
  // cargadas (filtro de servidor), evitando escuchar toda la tabla. Se
  // re-suscribe solo cuando cambia el conjunto de obras.
  private sincronizarCanalReportes(userId: string): void {
    const ids = [...new Set(this.obras().map(o => o.seguimientoId))].sort();
    const key = ids.join(',');
    if (key === this.reporteSegKey) return;
    this.reporteSegKey = key;

    if (this.reporteChannel) {
      this.auth.client.removeChannel(this.reporteChannel);
      this.reporteChannel = null;
    }
    if (!ids.length) return;

    this.reporteChannel = this.auth.client
      .channel(`cm-list-rep-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reporte_diario', filter: `seguimiento_id=in.(${ids.join(',')})` },
        () => this.programarRecarga(userId),
      )
      .subscribe();
  }

  // Agrupa ráfagas de eventos en una sola recarga en segundo plano (sin spinner).
  private programarRecarga(userId: string): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    this.recargaTimer = setTimeout(async () => {
      this.recargaTimer = null;
      await this.cargar(userId, false);
      this.sincronizarCanalReportes(userId);
    }, 600);
  }
}
