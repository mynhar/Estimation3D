import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ExpedienteService } from '../../../services/expediente.service';
import { ExpedienteCliente } from '../../../models';

interface EstadoCfg {
  texto: string;
  clase: string;
  icono: string;
  color: string;
  pipelineIdx: number;
}

type Filtro = 'todos' | 'activos' | 'finalizados';

@Component({
  selector: 'app-my-files',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './my-files.component.html',
  styleUrl: './my-files.component.css',
})
export class MyFilesComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteCliente[]>([]);
  cargando    = signal(true);

  // ── Filter ─────────────────────────────────────────────────────────────────
  filtro = signal<Filtro>('todos');

  expedientesFiltrados = computed(() => {
    const todos = this.expedientes();
    switch (this.filtro()) {
      case 'activos':     return todos.filter(e => e.estado !== 'cancelado' && e.estado !== 'contratado');
      case 'finalizados': return todos.filter(e => e.estado === 'contratado' || e.estado === 'cancelado');
      default:            return todos;
    }
  });

  // ── Counts ─────────────────────────────────────────────────────────────────
  countTodos      = computed(() => this.expedientes().length);
  countActivos    = computed(() => this.expedientes().filter(e => e.estado !== 'cancelado' && e.estado !== 'contratado').length);
  countFinalizados= computed(() => this.expedientes().filter(e => e.estado === 'contratado' || e.estado === 'cancelado').length);

  // ── Pipeline milestones ────────────────────────────────────────────────────
  readonly PIPELINE = [
    { label: 'Recibido'  },
    { label: 'Revisión'  },
    { label: 'Ofertas'   },
    { label: 'Elegido'   },
    { label: 'Firmado'   },
  ];

  // ── State config ───────────────────────────────────────────────────────────
  private readonly ESTADO_CFG: Record<string, EstadoCfg> = {
    nuevo:         { texto: 'Nuevo',        clase: 'badge-estado-nuevo',      icono: 'bi-inbox',              color: '#3b82f6', pipelineIdx: 0 },
    en_estimacion: { texto: 'En revisión',  clase: 'badge-estado-estimacion', icono: 'bi-clipboard2-pulse',   color: '#7c3aed', pipelineIdx: 1 },
    estimado:      { texto: 'Estimado',     clase: 'badge-estado-estimado',   icono: 'bi-check-circle',       color: '#059669', pipelineIdx: 1 },
    en_oferta:     { texto: 'Con ofertas',  clase: 'badge-estado-oferta',     icono: 'bi-cash-coin',          color: '#d97706', pipelineIdx: 2 },
    adjudicado:    { texto: 'Adjudicado',   clase: 'badge-estado-adjudicado', icono: 'bi-trophy',             color: '#ea580c', pipelineIdx: 3 },
    contratado:    { texto: 'Contratado',   clase: 'badge-estado-contratado', icono: 'bi-file-earmark-check', color: '#16a34a', pipelineIdx: 4 },
    cancelado:     { texto: 'Cancelado',    clase: 'badge-estado-cancelado',  icono: 'bi-x-circle',           color: '#94a3b8', pipelineIdx: -1 },
  };

  private readonly FALLBACK_CFG: EstadoCfg = {
    texto: '—', clase: 'badge-estado-cancelado', icono: 'bi-question-circle', color: '#94a3b8', pipelineIdx: 0,
  };

  // ── State hints (client-friendly next-step messages) ──────────────────────
  private readonly ESTADO_HINT: Record<string, string> = {
    nuevo:         'Tu solicitud fue recibida. Pronto se asignará un estimador.',
    en_estimacion: 'Un estimador está evaluando tu caso.',
    estimado:      'Estimación lista. Constructores pueden enviar propuestas.',
    en_oferta:     'Hay propuestas de constructores listas para revisar.',
    adjudicado:    'Constructor seleccionado. El contrato está en proceso.',
    contratado:    '¡Proyecto contratado! El trabajo está en marcha.',
    cancelado:     'Este expediente fue cancelado y ya no está activo.',
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }
    try {
      this.expedientes.set(await this.expedienteService.getMisExpedientes(userId));
    } catch (e: any) {
      console.error('[MyFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  estadoCfg(estado: string): EstadoCfg {
    return this.ESTADO_CFG[estado] ?? this.FALLBACK_CFG;
  }

  estadoHint(estado: string): string {
    return this.ESTADO_HINT[estado] ?? '';
  }

  dotActive(estado: string, stepIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) >= stepIdx;
  }

  dotCurrent(estado: string, stepIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) === stepIdx;
  }

  connectorBlue(estado: string, connectorIdx: number): boolean {
    if (estado === 'cancelado') return false;
    return (this.ESTADO_CFG[estado]?.pipelineIdx ?? 0) >= connectorIdx;
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    return new Date(valor).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
