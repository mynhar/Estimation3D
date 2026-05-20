import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteCliente } from '../../models';

export interface EstadoConfig {
  key:         string;
  color:       string;
  textColor:   string;
  progressPct: number;
  icon:        string;
}

export const ESTADOS: EstadoConfig[] = [
  { key: 'nuevo',         color: '#adb5bd', textColor: '#fff', progressPct: 10,  icon: 'bi-inbox'           },
  { key: 'en_estimacion', color: '#0dcaf0', textColor: '#000', progressPct: 30,  icon: 'bi-pencil-square'   },
  { key: 'estimado',      color: '#0d6efd', textColor: '#fff', progressPct: 55,  icon: 'bi-clipboard-check' },
  { key: 'en_oferta',     color: '#ffc107', textColor: '#000', progressPct: 70,  icon: 'bi-cash-coin'       },
  { key: 'adjudicado',    color: '#fd7e14', textColor: '#fff', progressPct: 85,  icon: 'bi-award'           },
  { key: 'contratado',    color: '#198754', textColor: '#fff', progressPct: 100, icon: 'bi-check2-circle'   },
];

const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgbTooltipModule, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);

  user        = toSignal(this.auth.user$);

  private currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang || 'fr' },
  );
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
    const segs: { key: string; count: number; color: string; dasharray: string; dashoffset: number }[] = [];
    for (const cfg of ESTADOS) {
      const count = this.expedientes().filter(e => e.estado === cfg.key).length;
      if (count === 0) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({ key: cfg.key, count, color: cfg.color,
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

  servicioNombre(s: ExpedienteCliente['servicio']): string {
    if (!s) return '';
    const lang = this.currentLang();
    if (lang === 'en') return s.nombre_en || s.nombre_fr || s.nombre_es || '';
    if (lang === 'es') return s.nombre_es || s.nombre_fr || '';
    return s.nombre_fr || s.nombre_es || '';
  }

  cfg(estado: string): EstadoConfig {
    return ESTADOS.find(e => e.key === estado) ?? ESTADOS[0];
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor.includes('T') ? valor : `${valor}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
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
