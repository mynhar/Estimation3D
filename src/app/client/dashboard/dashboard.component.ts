import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteCliente } from '../../models';

export interface EstadoConfig {
  key:         string;
  label:       string;
  desc:        string;
  color:       string;
  textColor:   string;
  progressPct: number;
  icon:        string;
}

export const ESTADOS: EstadoConfig[] = [
  { key: 'nuevo',         label: 'Nuevo',         color: '#adb5bd', textColor: '#fff', progressPct: 10,  icon: 'bi-inbox',           desc: 'En espera de asignación de estimador'          },
  { key: 'en_estimacion', label: 'En estimación', color: '#0dcaf0', textColor: '#000', progressPct: 30,  icon: 'bi-pencil-square',   desc: 'Un estimador está evaluando su proyecto'       },
  { key: 'estimado',      label: 'Estimado',      color: '#0d6efd', textColor: '#fff', progressPct: 55,  icon: 'bi-clipboard-check', desc: 'Estimación lista, esperando ofertas de constructores' },
  { key: 'en_oferta',     label: 'En oferta',     color: '#ffc107', textColor: '#000', progressPct: 70,  icon: 'bi-cash-coin',       desc: '¡Hay ofertas de constructores para revisar!'   },
  { key: 'adjudicado',    label: 'Adjudicado',    color: '#fd7e14', textColor: '#fff', progressPct: 85,  icon: 'bi-award',           desc: 'Oferta seleccionada, preparando contrato final' },
  { key: 'contratado',    label: 'Contratado',    color: '#198754', textColor: '#fff', progressPct: 100, icon: 'bi-check2-circle',   desc: '¡Proyecto contratado y en marcha!'             },
];

const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgbTooltipModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteCliente[]>([]);
  cargando    = signal(true);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  total       = computed(() => this.expedientes().length);
  enProceso   = computed(() =>
    this.expedientes().filter(e =>
      ['nuevo', 'en_estimacion', 'estimado'].includes(e.estado)).length);
  adjudicados = computed(() =>
    this.expedientes().filter(e => e.estado === 'adjudicado').length);
  completados = computed(() =>
    this.expedientes().filter(e => e.estado === 'contratado').length);

  conOfertasPendientes = computed(() =>
    this.expedientes().filter(e => e.estado === 'en_oferta').length);

  // ── Donut SVG ─────────────────────────────────────────────────────────────

  donutSegments = computed(() => {
    const total = this.total();
    if (total === 0) return [];
    let offset = 0;
    const segs: { label: string; count: number; color: string; dasharray: string; dashoffset: number }[] = [];
    for (const cfg of ESTADOS) {
      const count = this.expedientes().filter(e => e.estado === cfg.key).length;
      if (count === 0) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({ label: cfg.label, count, color: cfg.color,
        dasharray:  `${portion} ${CIRCUMFERENCE}`,
        dashoffset: -offset });
      offset += portion;
    }
    return segs;
  });

  estadoBreakdown = computed(() =>
    ESTADOS
      .map(cfg => ({ ...cfg, count: this.expedientes().filter(e => e.estado === cfg.key).length, pct: 0 }))
      .filter(cfg => cfg.count > 0)
      .map(cfg => ({ ...cfg, pct: Math.round((cfg.count / this.total()) * 100) }))
  );

  readonly R             = R;
  readonly CIRCUMFERENCE = CIRCUMFERENCE;

  // ── Helpers ───────────────────────────────────────────────────────────────

  cfg(estado: string): EstadoConfig {
    return ESTADOS.find(e => e.key === estado) ?? ESTADOS[0];
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get bienvenida(): string {
    const u = this.user();
    return u?.user_metadata?.['full_name']?.split(' ')[0]
      ?? u?.email?.split('@')[0]
      ?? '';
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) return;
    try {
      this.expedientes.set(await this.expedienteService.getMisExpedientes(userId));
    } catch (e: any) {
      console.error('[Dashboard]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
