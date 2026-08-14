import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import {
  HistorialClienteService,
  ExpedienteHistorialVM,
  EventoHistorialVM,
  CategoriaEvento,
} from '../../services/historial-cliente.service';

interface GrupoFecha {
  label:   string;
  eventos: EventoHistorialVM[];
}

// Fases del recorrido del expediente para la barra de progreso.
const FASES = ['creado', 'estimado', 'adjudicado', 'contratado', 'obra', 'completado'] as const;

@Component({
  selector: 'app-client-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './history.component.html',
  styleUrl: './history.component.css',
})
export class HistoryComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private historial = inject(HistorialClienteService);
  private translate = inject(TranslateService);

  private user = toSignal(this.auth.user$);

  expedientes = signal<ExpedienteHistorialVM[]>([]);
  cargando    = signal(true);
  error       = signal<string | null>(null);
  expandidos  = signal<Set<string>>(new Set());
  partesAbiertos = signal<Set<string>>(new Set());

  readonly fases = FASES;

  async ngOnInit(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      const data = await this.historial.getHistorial(userId);
      this.expedientes.set(data);
      this.expandidos.set(new Set(data.length ? [data[0].expedienteId] : []));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Acordeón ──────────────────────────────────────────────────────────────
  toggle(expId: string): void {
    this.expandidos.update(set => {
      const next = new Set(set);
      next.has(expId) ? next.delete(expId) : next.add(expId);
      return next;
    });
  }
  isExpandido(expId: string): boolean { return this.expandidos().has(expId); }

  // ── Colapso de partes de obra (rutina) ──────────────────────────────────────
  esParte(ev: EventoHistorialVM): boolean { return ev.titulo === 'history.parte_obra'; }

  contarPartes(exp: ExpedienteHistorialVM): number {
    return exp.eventos.filter(e => this.esParte(e)).length;
  }
  hayMuchosPartes(exp: ExpedienteHistorialVM): boolean { return this.contarPartes(exp) > 3; }

  partesColapsados(exp: ExpedienteHistorialVM): boolean {
    return this.hayMuchosPartes(exp) && !this.partesAbiertos().has(exp.expedienteId);
  }
  togglePartes(expId: string): void {
    this.partesAbiertos.update(set => {
      const next = new Set(set);
      next.has(expId) ? next.delete(expId) : next.add(expId);
      return next;
    });
  }

  // ── Agrupación por fecha (Hoy / Esta semana / por mes) ───────────────────────
  grupos(exp: ExpedienteHistorialVM): GrupoFecha[] {
    const visibles = this.partesColapsados(exp)
      ? exp.eventos.filter(e => !this.esParte(e))
      : exp.eventos;

    const now      = new Date();
    const hoy      = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const ayer     = hoy - 86_400_000;
    const semana   = hoy - 6 * 86_400_000;
    const locale   = this.localeActual();
    const mesFmt   = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });

    const out: { key: string; grupo: GrupoFecha }[] = [];
    for (const ev of visibles) {           // ya vienen del más reciente al más antiguo
      let key: string, label: string;
      if (ev.ts >= hoy)         { key = 'today';     label = this.translate.instant('history.bucket_today'); }
      else if (ev.ts >= ayer)   { key = 'yesterday'; label = this.translate.instant('history.bucket_yesterday'); }
      else if (ev.ts >= semana) { key = 'week';      label = this.translate.instant('history.bucket_week'); }
      else {
        const d = new Date(ev.ts);
        key = `${d.getFullYear()}-${d.getMonth()}`;
        label = this.capitalizar(mesFmt.format(d));
      }
      let bucket = out.find(b => b.key === key);
      if (!bucket) { bucket = { key, grupo: { label, eventos: [] } }; out.push(bucket); }
      bucket.grupo.eventos.push(ev);
    }
    return out.map(b => b.grupo);
  }

  // ── Barra de fases ──────────────────────────────────────────────────────────
  esCancelado(exp: ExpedienteHistorialVM): boolean { return exp.estado === 'cancelado'; }

  faseActual(exp: ExpedienteHistorialVM): number {
    if (exp.eventos.some(e => e.titulo === 'history.obra_finalizada')) return 5;
    if (exp.eventos.some(e => e.titulo === 'history.obra_iniciada'))   return 4;
    switch (exp.estado) {
      case 'contratado':            return 3;
      case 'adjudicado':            return 2;
      case 'estimado':
      case 'en_oferta':             return 1;
      default:                      return 0; // nuevo, en_estimacion
    }
  }
  estadoFase(exp: ExpedienteHistorialVM, i: number): 'done' | 'current' | 'pending' {
    const actual = this.faseActual(exp);
    if (i < actual)  return 'done';
    if (i === actual) return 'current';
    return 'pending';
  }

  // ── Presentación ────────────────────────────────────────────────────────────
  labelCategoria(cat: CategoriaEvento): string { return `history.cat_${cat}`; }

  private localeActual(): string {
    const map: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    return map[this.translate.currentLang] ?? 'fr-CA';
  }

  // Fecha corta para dentro de cada grupo: "12 jun".
  formatCorto(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(this.localeActual(), { day: 'numeric', month: 'short' }).format(d);
  }

  // Fecha completa para aria-label / accesibilidad.
  formatLargo(valor: string): string {
    if (!valor) return '';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(this.localeActual(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }

  formatHora(valor: string): string {
    if (!valor || !valor.includes('T')) return '';
    return valor.split('T')[1]?.slice(0, 5) ?? '';
  }

  private capitalizar(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
}
