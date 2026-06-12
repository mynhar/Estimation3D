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
import { SeguimientoService } from '../../../services/seguimiento.service';
import { ArchivoService, ReporteArchivoRow } from '../../../services/archivo.service';
import { ContratoListItem } from '../../../models';
import { ReporteZona } from '../../../data/seguimiento.repository';
import { ActividadServicio, FaseServicio } from '../../../models/seguimiento.model';
import { ActividadAvance, FaseAvance, ObraVM } from './obra.model';
import { ObraCardComponent } from './obra-card.component';

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
  private auth               = inject(AuthSupabaseService);
  private contratoService    = inject(ContratoService);
  private seguimientoService = inject(SeguimientoService);
  private archivoService     = inject(ArchivoService);

  private user = toSignal(this.auth.user$);

  obras    = signal<ObraVM[]>([]);
  cargando = signal(true);
  error    = signal<string | null>(null);

  // Realtime: refresco en vivo al arrancar la obra o registrarse un parte.
  private channels: RealtimeChannel[] = [];
  private recargaTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }

    await this.cargar(userId, true);
    this.suscribirRealtime(userId);
  }

  ngOnDestroy(): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    for (const ch of this.channels) this.auth.client.removeChannel(ch);
    this.channels = [];
  }

  private async cargar(userId: string, mostrarSpinner: boolean): Promise<void> {
    if (mostrarSpinner) this.cargando.set(true);
    try {
      const contratos = await this.contratoService.getMisContratos(userId);
      const conObra   = contratos.filter(c => ESTADOS_OBRA.includes(c.estado));

      const vms = await Promise.all(conObra.map(c => this.construirObra(c)));
      this.obras.set(
        vms
          .filter((v): v is ObraVM => v !== null)
          .sort((a, b) => b.ultimaActualizacion.localeCompare(a.ultimaActualizacion)),
      );
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mostrarSpinner) this.cargando.set(false);
    }
  }

  // ── Realtime ────────────────────────────────────────────────────────────────

  private suscribirRealtime(userId: string): void {
    // Cambios de estado del contrato (p. ej. arranque firmado → en_ejecucion,
    // o completado / cancelado, que añaden o quitan obras de la lista).
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

    // Partes diarios: sin filtro de columna porque reporte_diario no tiene
    // cliente_id; el RLS de reporte_diario ya limita los eventos a las obras
    // del cliente. Cualquier evento recibido es relevante.
    this.channels.push(
      this.auth.client
        .channel(`cm-list-rep-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reporte_diario' },
          () => this.programarRecarga(userId),
        )
        .subscribe(),
    );
  }

  // Agrupa ráfagas de eventos en una sola recarga en segundo plano (sin spinner).
  private programarRecarga(userId: string): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    this.recargaTimer = setTimeout(() => {
      this.recargaTimer = null;
      void this.cargar(userId, false);
    }, 600);
  }

  private async construirObra(c: ContratoListItem): Promise<ObraVM | null> {
    const seg = await this.seguimientoService.getSeguimientoByContratoId(c.id);
    if (!seg) return null;

    const hoyISO = this.fechaISO(new Date());

    const [fasesRaw, actividadesRaw, actsAgg, recientes, reporteHoy, stats] =
      await Promise.all([
        seg.servicio_id != null ? this.seguimientoService.getFasesByServicioId(seg.servicio_id)      : Promise.resolve([]),
        seg.servicio_id != null ? this.seguimientoService.getActividadesByServicioId(seg.servicio_id) : Promise.resolve([]),
        this.seguimientoService.getActividadesAgregadas(seg.id),
        this.seguimientoService.getReportesRecientes(seg.id, 6),
        this.seguimientoService.getReporteByFecha(seg.id, hoyISO),
        this.seguimientoService.getStatsReportes(seg.id),
      ]);

    const ultimoReporte = reporteHoy ?? recientes[0] ?? null;

    let zonas: ReporteZona[]            = [];
    let fotos: ReporteArchivoRow[]      = [];
    let videos: ReporteArchivoRow[]     = [];
    let documentos: ReporteArchivoRow[] = [];
    if (ultimoReporte) {
      const [z, media] = await Promise.all([
        this.seguimientoService.getZonasReporte(ultimoReporte.id),
        this.archivoService.cargarPorReporte(ultimoReporte.id),
      ]);
      zonas      = z;
      fotos      = media.fotos;
      videos     = media.videos;
      documentos = media.documentos;
    }

    const avanceGlobal = c.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance);

    return {
      contratoId:          c.id,
      seguimientoId:       seg.id,
      expedienteNumero:    c.expediente_numero,
      servicioNombre:      c.servicio_nombre,
      servicioNombreEn:    c.servicio_nombre_en,
      servicioNombreFr:    c.servicio_nombre_fr,
      estadoContrato:      c.estado,
      avanceGlobal,
      ultimaActualizacion: seg.actualizado_en,
      plazoMin:            c.plazo_semanas_min,
      plazoMax:            c.plazo_semanas_max,
      llegadaFecha:        ultimoReporte?.fecha ?? null,
      llegadaHora:         ultimoReporte?.hora_inicio ?? null,
      horasDia:            ultimoReporte?.horas_trabajadas ?? null,
      fases:               this.calcularFases(fasesRaw, avanceGlobal),
      actividades:         this.calcularActividades(actividadesRaw, actsAgg, stats.total_dias),
      zonas,
      eventos:             recientes,
      reporteMediaFecha:   ultimoReporte?.fecha ?? null,
      fotos, videos, documentos,
    };
  }

  // Avance por fase: reparte el avance global entre las fases ordenadas.
  // Cada fase ocupa un segmento igual; su % es la porción del avance global
  // que cae dentro de su segmento.
  private calcularFases(fases: FaseServicio[], avanceGlobal: number): FaseAvance[] {
    const n = fases.length;
    if (n === 0) return [];
    const seg = 100 / n;
    return fases
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((fase, i) => {
        const lower = i * seg;
        const pct   = Math.max(0, Math.min(100, ((avanceGlobal - lower) / seg) * 100));
        return { fase, pct: Math.round(pct) };
      });
  }

  // Avance por actividad: porcentaje de días trabajados en que se realizó.
  private calcularActividades(
    actividades: ActividadServicio[],
    agg:         { actividad_id: string; dias: number }[],
    totalDias:   number,
  ): ActividadAvance[] {
    const mapa = new Map(agg.map(a => [a.actividad_id, a.dias]));
    return actividades.map(actividad => {
      const dias = mapa.get(actividad.id) ?? 0;
      const pct  = totalDias > 0 ? Math.round((dias / totalDias) * 100) : 0;
      return { actividad, dias, pct, hecha: dias > 0 };
    });
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
