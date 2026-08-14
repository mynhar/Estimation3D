import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RealtimeChannel } from '@supabase/supabase-js';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { SeguimientoService } from '../../services/seguimiento.service';
import { Inspeccion, InspeccionInput } from '../../models/seguimiento.model';

interface CalDia { num: number; tipo: 'vacio' | 'normal' | 'trabajado' | 'hoy' | 'inspeccion'; }

@Component({
  selector: 'app-obra-inspecciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './obra-inspecciones.component.html',
  styleUrl: './obra-inspecciones.component.css',
})
export class ObraInspeccionesComponent implements OnInit, OnDestroy {
  // Id del seguimiento (obra) cuyas inspecciones gestiona este panel.
  seguimientoId = input.required<string>();

  private auth               = inject(AuthSupabaseService);
  private seguimientoService = inject(SeguimientoService);
  private translate          = inject(TranslateService);

  private user = toSignal(this.auth.user$);
  private rol  = toSignal(this.auth.rol$);
  private lang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang },
  );

  // El estimador puede agendar visitas como 'Estimador'; el botón solo se
  // muestra para ese rol.
  esEstimador = computed(() => this.rol() === 'estimador');

  // ── Datos ──────────────────────────────────────────────────────────────────
  proximas            = signal<Inspeccion[]>([]);
  fechasTrabajadasMes = signal<Set<string>>(new Set());
  fechasInspeccionMes = signal<Set<string>>(new Set());

  // ── UI ─────────────────────────────────────────────────────────────────────
  calVisible    = signal(false);
  agendaVisible = signal(false);
  eliminandoId  = signal<string | null>(null);

  // ── Formulario de agenda ────────────────────────────────────────────────────
  nuevaTipo   = signal<'inspector' | 'dueno' | 'estimador'>('dueno');
  private tipoTocado = false;
  nuevaFecha  = signal('');
  nuevaHora   = signal('10:00');
  nuevaMotivo = signal('');
  guardando   = signal(false);
  errorInsp   = signal<string | null>(null);

  readonly fechaHoy = this.fechaISO(new Date());
  readonly CAL_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // Realtime: refresco en vivo cuando se agenda/elimina una inspección.
  private channel: RealtimeChannel | null = null;
  private recargaTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Calendario ──────────────────────────────────────────────────────────────
  mesLabel = computed(() => {
    const s = new Intl.DateTimeFormat(this.langLocale(), { month: 'long', year: 'numeric' }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  calDias = computed((): CalDia[] => {
    const hoy        = new Date();
    const year       = hoy.getFullYear();
    const month      = hoy.getMonth();
    const first      = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0).getDate();
    const trabajadas = this.fechasTrabajadasMes();
    const inspDates  = this.fechasInspeccionMes();

    const dias: CalDia[] = [];
    const startDow = (first.getDay() + 6) % 7;
    for (let i = 0; i < startDow; i++) dias.push({ num: 0, tipo: 'vacio' });

    for (let d = 1; d <= lastDay; d++) {
      const fecha = new Date(year, month, d);
      const esHoy = fecha.toDateString() === hoy.toDateString();
      const iso   = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let tipo: CalDia['tipo'] = 'normal';
      if (esHoy)                    tipo = 'hoy';
      else if (inspDates.has(iso))  tipo = 'inspeccion';
      else if (trabajadas.has(iso)) tipo = 'trabajado';
      dias.push({ num: d, tipo });
    }
    return dias;
  });

  // ── Ciclo de vida ───────────────────────────────────────────────────────────

  constructor() {
    // Para el estimador, el visitante por defecto es 'Estimador' mientras no lo
    // cambie manualmente. El rol llega de forma asíncrona, por eso vía effect.
    effect(() => {
      if (this.esEstimador() && !this.tipoTocado) {
        this.nuevaTipo.set('estimador');
      }
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    await this.recargar();
    this.suscribirRealtime();
  }

  ngOnDestroy(): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    if (this.channel) {
      this.auth.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // ── Realtime ────────────────────────────────────────────────────────────────

  private suscribirRealtime(): void {
    const segId = this.seguimientoId();
    this.channel = this.auth.client
      .channel(`oi-insp-${segId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspeccion', filter: `seguimiento_id=eq.${segId}` },
        () => this.programarRecarga(),
      )
      .subscribe();
  }

  // Agrupa ráfagas de eventos en una sola recarga. No toca el formulario de
  // agenda abierto (solo refresca la lista, el mes y los días del calendario).
  private programarRecarga(): void {
    if (this.recargaTimer) clearTimeout(this.recargaTimer);
    this.recargaTimer = setTimeout(() => {
      this.recargaTimer = null;
      void this.recargar();
    }, 500);
  }

  private async recargar(): Promise<void> {
    const segId = this.seguimientoId();
    const hoy = new Date();
    const [proximas, mes, fechasMes] = await Promise.all([
      this.seguimientoService.getProximasInspecciones(segId, 3),
      this.seguimientoService.getInspeccionesMes(segId, hoy.getFullYear(), hoy.getMonth() + 1),
      this.seguimientoService.getFechasTrabajadasMes(segId, hoy.getFullYear(), hoy.getMonth() + 1),
    ]);
    this.proximas.set(proximas);
    this.fechasInspeccionMes.set(new Set(mes.map(i => i.fecha)));
    this.fechasTrabajadasMes.set(new Set(fechasMes));
  }

  // ── Acciones ────────────────────────────────────────────────────────────────

  toggleAgenda(): void {
    this.agendaVisible.set(!this.agendaVisible());
    this.errorInsp.set(null);
  }

  cancelarAgenda(): void {
    this.agendaVisible.set(false);
    this.errorInsp.set(null);
  }

  setTipo(tipo: 'inspector' | 'dueno' | 'estimador') {
    this.tipoTocado = true;
    this.nuevaTipo.set(tipo);
  }
  setFecha(e: Event)  { this.nuevaFecha.set((e.target as HTMLInputElement).value); }
  setHora(e: Event)   { this.nuevaHora.set((e.target as HTMLInputElement).value); }
  setMotivo(e: Event) { this.nuevaMotivo.set((e.target as HTMLInputElement).value); }

  async guardarInspeccion(): Promise<void> {
    if (!this.nuevaFecha() || !this.nuevaHora()) {
      this.errorInsp.set('monitoring.error_campos');
      return;
    }
    const userId = this.user()?.id;
    if (!userId) return;

    this.guardando.set(true);
    this.errorInsp.set(null);
    try {
      const input: InspeccionInput = {
        seguimiento_id: this.seguimientoId(),
        tipo_visitante: this.nuevaTipo(),
        fecha:          this.nuevaFecha(),
        hora:           this.nuevaHora(),
        motivo:         this.nuevaMotivo() || null,
        creado_por:     userId,
      };
      await this.seguimientoService.insertInspeccion(input);

      this.nuevaFecha.set('');
      this.nuevaHora.set('10:00');
      this.nuevaMotivo.set('');
      this.tipoTocado = false;
      this.nuevaTipo.set(this.esEstimador() ? 'estimador' : 'dueno');
      this.agendaVisible.set(false);

      await this.recargar();
    } catch (e: unknown) {
      this.errorInsp.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminarInspeccion(insp: Inspeccion): Promise<void> {
    this.eliminandoId.set(insp.id);
    try {
      await this.seguimientoService.deleteInspeccion(insp.id);
      await this.recargar();
    } catch (e: unknown) {
      this.errorInsp.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.eliminandoId.set(null);
    }
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  horaCorta(valor: string | null): string {
    return valor ? valor.substring(0, 5) : '—';
  }

  diaNum(fecha: string): string {
    const raw = fecha.includes('T') ? fecha.split('T')[0] : fecha;
    return new Date(`${raw}T00:00:00`).getDate().toString();
  }

  mesCorto(fecha: string): string {
    const raw = fecha.includes('T') ? fecha.split('T')[0] : fecha;
    return new Intl.DateTimeFormat(this.langLocale(), { month: 'short' })
      .format(new Date(`${raw}T00:00:00`))
      .toUpperCase()
      .replace('.', '');
  }

  private langLocale(): string {
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    return localeMap[this.lang() ?? this.translate.currentLang] ?? 'fr-CA';
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
