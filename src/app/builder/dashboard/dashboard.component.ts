import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { OfertaService } from '../../services/oferta.service';
import { ContratoService } from '../../services/contrato.service';
import { SeguimientoService } from '../../services/seguimiento.service';
import { OfertaDashboard } from '../../models';

// Icono y clase semántica (token) por estado de oferta. Los colores viven en
// el CSS como clases is-warning / is-success / is-danger — nunca hex inline.
const OFERTA_META: Record<string, { icon: string; cls: string }> = {
  pendiente: { icon: 'bi-hourglass-split', cls: 'is-warning' },
  aceptada:  { icon: 'bi-check-circle',    cls: 'is-success' },
  rechazada: { icon: 'bi-x-circle',        cls: 'is-danger'  },
};

// Donut (sidebar)
const R             = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Ring de progreso por oferta (viewBox 56×56, r=23)
const RING_R    = 23;
const RING_CIRC = 2 * Math.PI * RING_R;

function calcProgress(ofertaEstado: string, expEstado: string): number {
  if (ofertaEstado === 'rechazada') return 0;
  if (ofertaEstado === 'pendiente') return 35;
  if (expEstado    === 'contratado') return 100;
  if (expEstado    === 'adjudicado') return 80;
  return 60;
}

// Resumen de una obra (contrato activo) para el seguimiento del dashboard.
interface ObraResumen {
  contratoId:       string;
  expedienteNumero: string;
  servicioNombre:   string;
  servicioNombreEn: string;
  servicioNombreFr: string;
  estado:           string;
  avance:           number;
  actualizadoEn:    string;
}

@Component({
  selector: 'app-builder-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgbTooltipModule, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class BuilderDashboardComponent implements OnInit {
  private auth               = inject(AuthSupabaseService);
  private ofertaService      = inject(OfertaService);
  private contratoService    = inject(ContratoService);
  private seguimientoService = inject(SeguimientoService);
  private translate          = inject(TranslateService);

  user     = toSignal(this.auth.user$);
  perfil   = signal<{ nombre: string | null; apellido: string | null } | null>(null);
  ofertas  = signal<OfertaDashboard[]>([]);
  obras    = signal<ObraResumen[]>([]);
  cargando = signal(true);

  // ── KPIs ofertas ───────────────────────────────────────────────────────────
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

  // ── KPIs obra ────────────────────────────────────────────────────────────────
  totalObras   = computed(() => this.obras().length);
  obrasActivas = computed(() => this.obras().filter(o => o.estado === 'en_ejecucion').length);
  avanceMedio  = computed(() => {
    const o = this.obras();
    return o.length === 0 ? 0 : Math.round(o.reduce((s, x) => s + x.avance, 0) / o.length);
  });

  // ── Donut SVG ─────────────────────────────────────────────────────────────
  readonly R             = R;
  readonly CIRCUMFERENCE = CIRCUMFERENCE;

  donutSegments = computed(() => {
    const total = this.total();
    if (total === 0) return [];
    let offset = 0;
    const segs: { cls: string; dasharray: string; dashoffset: number }[] = [];
    for (const key of ['pendiente', 'aceptada', 'rechazada']) {
      const count = this.ofertas().filter(o => o.estado === key).length;
      if (count === 0) continue;
      const portion = (count / total) * CIRCUMFERENCE;
      segs.push({
        cls: OFERTA_META[key].cls,
        dasharray: `${portion} ${CIRCUMFERENCE}`,
        dashoffset: -offset,
      });
      offset += portion;
    }
    return segs;
  });

  estadoBreakdown = computed(() =>
    ['pendiente', 'aceptada', 'rechazada'].map(key => ({
      key, icon: OFERTA_META[key].icon, cls: OFERTA_META[key].cls,
      count: this.ofertas().filter(o => o.estado === key).length,
      pct:   this.total() > 0
        ? Math.round((this.ofertas().filter(o => o.estado === key).length / this.total()) * 100)
        : 0,
    })).filter(e => e.count > 0)
  );

  // ── Ring de progreso ──────────────────────────────────────────────────────
  readonly RING_R    = RING_R;
  readonly RING_CIRC = RING_CIRC;

  ringOffset(oferta: OfertaDashboard): string {
    return (RING_CIRC * (1 - this.progress(oferta) / 100)).toFixed(2);
  }

  // ── Referencia de progreso ────────────────────────────────────────────────
  readonly progressRefs = [
    { pct: 35,  cls: 'is-warning', label: 'dashboard_builder.ref_35'  },
    { pct: 60,  cls: 'is-success', label: 'dashboard_builder.ref_60'  },
    { pct: 80,  cls: 'is-success', label: 'dashboard_builder.ref_80'  },
    { pct: 100, cls: 'is-success', label: 'dashboard_builder.ref_100' },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────
  ofertaIcon(estado: string): string { return (OFERTA_META[estado] ?? OFERTA_META['pendiente']).icon; }
  ofertaCls(estado: string):  string { return (OFERTA_META[estado] ?? OFERTA_META['pendiente']).cls; }

  servicioNombre(oferta: OfertaDashboard): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return oferta.servicio_nombre_en || oferta.servicio_nombre;
    if (lang === 'fr') return oferta.servicio_nombre_fr || oferta.servicio_nombre;
    return oferta.servicio_nombre;
  }

  servicioObra(o: ObraResumen): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return o.servicioNombreEn || o.servicioNombre;
    if (lang === 'fr') return o.servicioNombreFr || o.servicioNombre;
    return o.servicioNombre;
  }

  obraEstadoCls(estado: string): string {
    return estado === 'completado' ? 'is-success'
         : estado === 'en_ejecucion' ? 'is-gold'
         : 'is-info';
  }

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
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  formatFechaCorta(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return this.formatFecha(valor);
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  }

  get bienvenida(): string {
    const p = this.perfil();
    if (p?.nombre) {
      return [p.nombre, p.apellido].filter(Boolean).join(' ');
    }
    const u = this.user();
    return u?.user_metadata?.['full_name'] ?? u?.email?.split('@')[0] ?? '';
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      const [perfilRes, ofertas, contratos] = await Promise.all([
        this.auth.client.from('perfil').select('nombre, apellido').eq('id', userId).single(),
        this.ofertaService.getMisOfertasDashboard(userId),
        this.contratoService.getContratosConstructor(userId),
      ]);

      if (perfilRes.data) this.perfil.set(perfilRes.data);
      this.ofertas.set(ofertas);

      // Obras en curso (contratos firmados / en ejecución) con su avance.
      const activos = contratos.filter(c => c.estado === 'firmado' || c.estado === 'en_ejecucion');
      const obras = await Promise.all(activos.map(async c => {
        const seg = await this.seguimientoService.getSeguimientoByContratoId(c.id);
        return {
          contratoId:       c.id,
          expedienteNumero: c.expediente_numero,
          servicioNombre:   c.servicio_nombre,
          servicioNombreEn: c.servicio_nombre_en,
          servicioNombreFr: c.servicio_nombre_fr,
          estado:           c.estado,
          avance:           Math.round(seg?.porcentaje_avance ?? 0),
          actualizadoEn:    seg?.actualizado_en ?? c.actualizado_en,
        } as ObraResumen;
      }));
      obras.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
      this.obras.set(obras);
    } catch (e: unknown) {
      console.error('[BuilderDashboard]', e instanceof Error ? e.message : String(e));
    } finally {
      this.cargando.set(false);
    }
  }
}
