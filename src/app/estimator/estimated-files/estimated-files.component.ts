import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { EstimacionService } from '../../services/estimacion.service';
import {
  ExpedienteRow,
  ESTADOS_ESTIMADO,
  ESTADO_BADGE_ESTIMADOR,
  ESTADO_LABEL_ESTIMADOR,
} from '../../models';

@Component({
  selector: 'app-estimated-files',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './estimated-files.component.html',
  styleUrl:    './estimated-files.component.css',
})
export class EstimatedFilesComponent implements OnInit {
  private auth               = inject(AuthSupabaseService);
  private expedienteService  = inject(ExpedienteService);
  private estimacionService  = inject(EstimacionService);
  private router             = inject(Router);

  user         = toSignal(this.auth.user$);
  expedientes  = signal<ExpedienteRow[]>([]);
  cargando     = signal(true);
  busqueda     = signal('');
  filtroEstado = signal<string | null>(null);

  confirmandoId  = signal<string | null>(null);
  eliminando     = signal(false);
  errorEliminar  = signal('');

  readonly estadoChips: { value: string; label: string }[] = [
    { value: 'estimado',   label: 'Estimado'   },
    { value: 'en_oferta',  label: 'En oferta'  },
    { value: 'adjudicado', label: 'Adjudicado' },
    { value: 'contratado', label: 'Contratado' },
    { value: 'cancelado',  label: 'Cancelado'  },
  ];

  expedientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const e = this.filtroEstado();
    return this.expedientes().filter(exp => {
      if (e && exp.estado !== e) return false;
      if (!q) return true;
      return (
        exp.numero.toLowerCase().includes(q)          ||
        exp.servicio_nombre.toLowerCase().includes(q) ||
        exp.cliente_nombre.toLowerCase().includes(q)  ||
        exp.provincia.toLowerCase().includes(q)       ||
        exp.canton.toLowerCase().includes(q)
      );
    });
  });

  hayFiltros = computed(() => this.busqueda() !== '' || this.filtroEstado() !== null);

  contarEstado(estado: string): number {
    return this.expedientes().filter(e => e.estado === estado).length;
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.expedientes.set(await this.expedienteService.getExpedienteRows({
        estados:     ESTADOS_ESTIMADO,
        estimadorId: userId,
      }));
    } catch (e: any) {
      console.error('[EstimatedFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  badgeClass(estado: string | undefined): string {
    return ESTADO_BADGE_ESTIMADOR[estado ?? ''] ?? 'bg-light text-dark';
  }

  estadoLabel(estado: string | undefined): string {
    return ESTADO_LABEL_ESTIMADOR[estado ?? ''] ?? estado ?? '—';
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.filtroEstado.set(null);
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatHora(valor: string): string {
    if (!valor) return '—';
    if (valor.includes('T')) {
      const time = valor.split('T')[1]?.slice(0, 5);
      return time ?? '—';
    }
    return '—';
  }

  ver(id: string) {
    this.router.navigate(['/estimator/estimated-file', id]);
  }

  pedirConfirmacion(id: string) {
    const exp = this.expedientes().find(e => e.id === id);
    if (exp?.estado === 'adjudicado' || exp?.estado === 'contratado') return;
    this.errorEliminar.set('');
    this.confirmandoId.set(id);
  }

  cancelarConfirmacion() {
    this.confirmandoId.set(null);
    this.errorEliminar.set('');
  }

  async eliminarEstimacion(exp: ExpedienteRow) {
    this.errorEliminar.set('');
    this.eliminando.set(true);
    try {
      await this.estimacionService.eliminar(exp.id);
      await this.expedienteService.actualizarEstado(exp.id, 'nuevo');
      this.expedientes.update(list => list.filter(e => e.id !== exp.id));
      this.confirmandoId.set(null);
    } catch (e: any) {
      console.error('[EstimatedFiles] eliminar:', e.message);
      this.errorEliminar.set(e.message);
    } finally {
      this.eliminando.set(false);
    }
  }
}
