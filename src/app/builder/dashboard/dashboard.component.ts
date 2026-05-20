import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { OfertaService } from '../../services/oferta.service';
import { OfertaDashboard } from '../../models';

interface EstadoCfg {
  color:     string;
  textColor: string;
  icon:      string;
}

const OFERTA_CFG: Record<string, EstadoCfg> = {
  pendiente: { color: '#ffc107', textColor: '#000', icon: 'bi-hourglass-split' },
  aceptada:  { color: '#198754', textColor: '#fff', icon: 'bi-trophy'          },
  rechazada: { color: '#dc3545', textColor: '#fff', icon: 'bi-x-circle'        },
};

const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

function calcProgress(ofertaEstado: string, expEstado: string): number {
  if (ofertaEstado === 'rechazada') return 0;
  if (ofertaEstado === 'pendiente') return 35;
  if (expEstado    === 'contratado') return 100;
  if (expEstado    === 'adjudicado') return 80;
  return 60;
}

@Component({
  selector: 'app-builder-dashboard',
  standalone: true,
  imports: [RouterLink, NgbTooltipModule, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class BuilderDashboardComponent implements OnInit {
  private auth          = inject(AuthSupabaseService);
  private ofertaService = inject(OfertaService);
  private translate     = inject(TranslateService);

  user     = toSignal(this.auth.user$);
  ofertas  = signal<OfertaDashboard[]>([]);
  cargando = signal(true);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  total      = computed(() => this.ofertas().length);
  pendientes = computed(() => this.ofertas().filter(o => o.estado === 'pendiente').length);
  aceptadas  = computed(() => this.ofertas().filter(o => o.estado === 'aceptada').length);
  rechazadas = computed(() => this.ofertas().filter(o => o.estado === 'rechazada').length);

  montoAdjudicado = computed(() =>
    this.ofertas().filter(o => o.estado === 'aceptada').reduce((s, o) => s + o.precio, 0)
  );

  tasaExito = computed(() => {
    const t = this.total();
    return t === 0 ? 0 : Math.round((this.aceptadas() / t) * 100);
  });

  // ── Donut SVG ─────────────────────────────────────────────────────────────
  readonly R             = R;
  readonly CIRCUMFERENCE = CIRCUMFERENCE;

  donutSegments = computed(() => {
    const total = this.total();
    if (total === 0) return [];
    let offset = 0;
    const segs: { color: string; dasharray: string; dashoffset: number }[] = [];
    for (const key of ['pendiente', 'aceptada', 'rechazada']) {
      const count = this.ofertas().filter(o => o.estado === key).length;
      if (count === 0) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({ color: OFERTA_CFG[key].color,
        dasharray: `${portion} ${CIRCUMFERENCE}`, dashoffset: -offset });
      offset += portion;
    }
    return segs;
  });

  estadoBreakdown = computed(() =>
    ['pendiente', 'aceptada', 'rechazada'].map(key => ({
      key, ...OFERTA_CFG[key],
      count: this.ofertas().filter(o => o.estado === key).length,
      pct:   this.total() > 0
        ? Math.round((this.ofertas().filter(o => o.estado === key).length / this.total()) * 100)
        : 0,
    })).filter(e => e.count > 0)
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  cfg(estado: string): EstadoCfg { return OFERTA_CFG[estado] ?? OFERTA_CFG['pendiente']; }

  progress(oferta: OfertaDashboard): number {
    return calcProgress(oferta.estado, oferta.expediente_estado);
  }

  formatPrecio(v: number): string {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
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
    return u?.user_metadata?.['full_name']?.split(' ')[0] ?? u?.email?.split('@')[0] ?? '';
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) return;
    try {
      this.ofertas.set(await this.ofertaService.getMisOfertasDashboard(userId));
    } catch (e: any) {
      console.error('[BuilderDashboard]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
