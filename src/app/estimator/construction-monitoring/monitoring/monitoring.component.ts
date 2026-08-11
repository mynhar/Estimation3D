import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ContratoService } from '../../../services/contrato.service';
import { ObraVmService } from '../../../services/obra-vm.service';
import { ObraVM } from '../../../models';
import { ObraCardComponent } from '../../../shared/construction-monitoring/obra-card.component';

@Component({
  selector: 'app-estimator-construction-monitoring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, ObraCardComponent],
  templateUrl: './monitoring.component.html',
  styleUrl: './monitoring.component.css',
})
export class EstimatorConstructionMonitoringComponent implements OnInit, OnDestroy {
  private auth            = inject(AuthSupabaseService);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private contratoService = inject(ContratoService);
  private obraVm          = inject(ObraVmService);

  private user = toSignal(this.auth.user$);

  obra     = signal<ObraVM | null>(null);
  cargando = signal(true);
  error    = signal<string | null>(null);

  /**
   * El contrato del id de la URL no está entre los del estimador. Es un caso
   * distinto de "todavía no hay seguimiento": no es que la obra no haya
   * arrancado, es que este expediente no es suyo (o el id no existe). Sin este
   * estado la pantalla se quedaba muda, porque RLS filtra la fila en silencio.
   */
  noAccesible = signal(false);

  private contratoId = '';
  private channels: RealtimeChannel[] = [];
  private recargaTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    this.contratoId = this.route.snapshot.paramMap.get('id') ?? '';
    const userId = this.user()?.id;
    if (!userId || !this.contratoId) { this.cargando.set(false); return; }

    await this.cargar(userId, true);
    this.suscribirRealtime();
  }

  ngOnDestroy(): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    for (const ch of this.channels) this.auth.client.removeChannel(ch);
    this.channels = [];
  }

  volver(): void {
    this.router.navigate(['/estimator/construction-monitoring/list']);
  }

  private async cargar(userId: string, mostrarSpinner: boolean): Promise<void> {
    if (mostrarSpinner) this.cargando.set(true);
    try {
      const contratos = await this.contratoService.getContratosEstimador(userId);
      const contrato  = contratos.find(c => c.id === this.contratoId);
      if (!contrato) {
        this.obra.set(null);
        this.error.set(null);
        this.noAccesible.set(true);
        return;
      }

      this.noAccesible.set(false);
      this.obra.set(await this.obraVm.construirObra(contrato));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mostrarSpinner) this.cargando.set(false);
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  // Refleja en vivo: arranque/fin del contrato (estado) y partes diarios de la
  // obra. Las inspecciones se refrescan dentro de obra-card → obra-inspecciones,
  // que tiene su propia suscripción.
  private suscribirRealtime(): void {
    // Estado del contrato: firmado → en_ejecucion (arranca), completado, cancelado.
    this.channels.push(
      this.auth.client
        .channel(`est-cm-ctr-${this.contratoId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'contrato', filter: `id=eq.${this.contratoId}` },
          () => this.programarRecarga(),
        )
        .subscribe(),
    );

    // Partes diarios de esta obra (avance, eventos, media). Acotado por
    // seguimiento_id; reporte_diario es REPLICA IDENTITY FULL → también casan
    // los DELETE.
    const segId = this.obra()?.seguimientoId;
    if (segId) {
      this.channels.push(
        this.auth.client
          .channel(`est-cm-rep-${segId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'reporte_diario', filter: `seguimiento_id=eq.${segId}` },
            () => this.programarRecarga(),
          )
          .subscribe(),
      );
    }
  }

  private programarRecarga(): void {
    const userId = this.user()?.id;
    if (!userId) return;
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    this.recargaTimer = setTimeout(() => {
      this.recargaTimer = null;
      void this.cargar(userId, false);
    }, 600);
  }
}
