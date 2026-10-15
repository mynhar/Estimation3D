import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ArchivoService, ReporteArchivoRow } from '../../services/archivo.service';
import { ObraVmService } from '../../services/obra-vm.service';
import {
  ActividadServicio,
  FaseServicio,
  ReporteDiario,
} from '../../models/seguimiento.model';
import { ObraVM, ParteDia, nombreServicio } from '../../models';
import { ObraInspeccionesComponent } from './obra-inspecciones.component';

/** Un día del historial: todos sus partes (uno por servicio trabajado). */
interface DiaObra {
  fecha:     string;
  partes:    ReporteDiario[];
  /** Avance aportado ese día: la suma de sus partes. */
  delta:     number;
  /** Avance acumulado al cerrar el día: el mayor de sus partes. */
  acumulado: number | null;
}

@Component({
  selector: 'app-obra-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ObraInspeccionesComponent],
  templateUrl: './obra-card.component.html',
  styleUrl: './obra-card.component.css',
  host: { '(document:keydown.escape)': 'cerrarViewer()' },
})
export class ObraCardComponent implements OnDestroy {
  obra = input.required<ObraVM>();

  private auth           = inject(AuthSupabaseService);
  private archivoService = inject(ArchivoService);
  private obraVm         = inject(ObraVmService);
  private translate      = inject(TranslateService);

  currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang },
  );

  /** Historial agrupado por día, del más reciente al más antiguo. */
  dias = computed<DiaObra[]>(() => {
    const porFecha = new Map<string, ReporteDiario[]>();
    for (const r of this.obra().eventos) {
      const f = this.soloFecha(r.fecha);
      const arr = porFecha.get(f);
      if (arr) arr.push(r); else porFecha.set(f, [r]);
    }
    return [...porFecha.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([fecha, partes]) => {
        const orden = [...partes].sort((a, b) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''));
        const acums = orden.map(p => p.porcentaje_acumulado).filter((v): v is number => v != null);
        return {
          fecha,
          partes:    orden,
          delta:     orden.reduce((t, p) => t + (p.porcentaje_avance_dia ?? 0), 0),
          acumulado: acums.length ? Math.max(...acums) : null,
        };
      });
  });

  /** Con varios servicios en el contrato, cada parte dice el suyo. */
  multiServicio = computed(() => (this.obra().servicios?.length ?? 0) > 1);

  // Día seleccionado en el historial y el detalle de todos sus partes.
  fechaSel    = signal<string | null>(null);
  partesDia   = signal<ParteDia[]>([]);
  cargandoDia = signal(false);

  /** Llegada del día: la hora de inicio más temprana de sus partes. */
  horaLlegada = computed(() => {
    const horas = this.partesDia().map(p => p.reporte.hora_inicio).filter(Boolean).sort();
    return horas[0] ?? null;
  });

  /** Horas del día: la suma de sus partes. */
  horasDia = computed(() => {
    const partes = this.partesDia();
    if (!partes.length) return null;
    return Math.round(partes.reduce((t, p) => t + (p.reporte.horas_trabajadas ?? 0), 0) * 10) / 10;
  });

  hayZonas = computed(() => this.partesDia().some(p => p.zonas.length > 0));

  /** Hay que rotular cada grupo con su servicio cuando el día tiene varios partes. */
  variosPartes = computed(() => this.partesDia().length > 1);

  mediaViewer = signal<{ tipo: 'foto' | 'video'; url: string; nombre: string } | null>(null);

  readonly PASOS = [
    { key: 'firmado',      icon: 'bi-pen'           },
    { key: 'en_ejecucion', icon: 'bi-tools'         },
    { key: 'completado',   icon: 'bi-check2-circle' },
  ];

  // Partes del último día ya sembrados; evita re-sembrar (y perder la
  // selección manual del usuario) en recargas que no traen nada nuevo.
  private ultimoSembrado: string | undefined = undefined;
  // Evita que una carga lenta de un día pise la de otro elegido después.
  private cargaDia = 0;

  // Realtime de la media: suscripción acotada a los partes del día elegido.
  private archivoChannel: RealtimeChannel | null = null;
  private archivoClave: string | null = null;

  // ── Ciclo de vida ───────────────────────────────────────────────────────────

  constructor() {
    // Siembra el día más reciente al inicio y cada vez que llega un parte
    // nuevo (recarga en vivo). Si no cambió nada, respeta la selección actual.
    effect(() => {
      const o     = this.obra();
      const clave = o.partesUltimoDia.map(p => p.reporte.id).join(',');
      if (clave === this.ultimoSembrado) return;
      this.ultimoSembrado = clave;
      this.cargaDia++;
      this.fechaSel.set(o.partesUltimoDia[0] ? this.soloFecha(o.partesUltimoDia[0].reporte.fecha) : null);
      this.partesDia.set(o.partesUltimoDia);
      this.cargandoDia.set(false);
    }, { allowSignalWrites: true });

    // Re-suscribe el canal de media a los partes del día elegido, para reflejar
    // en vivo las fotos/vídeos/documentos que sube o elimina el constructor.
    effect(() => this.sincronizarCanalArchivo(this.partesDia().map(p => p.reporte.id)));
  }

  ngOnDestroy(): void {
    if (this.archivoChannel) {
      this.auth.client.removeChannel(this.archivoChannel);
      this.archivoChannel = null;
    }
  }

  private sincronizarCanalArchivo(reporteIds: string[]): void {
    const clave = reporteIds.join(',');
    if (clave === this.archivoClave) return;
    this.archivoClave = clave;

    if (this.archivoChannel) {
      this.auth.client.removeChannel(this.archivoChannel);
      this.archivoChannel = null;
    }
    if (!reporteIds.length) return;

    this.archivoChannel = this.auth.client
      .channel(`oc-arch-${reporteIds[0]}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'archivo', filter: `reporte_id=in.(${clave})` },
        () => void this.recargarDiaSeleccionado(clave),
      )
      .subscribe();
  }

  /** Recarga el detalle del día elegido si sigue siendo el mismo. */
  private async recargarDiaSeleccionado(clave: string): Promise<void> {
    const reportes = this.partesDia().map(p => p.reporte);
    if (reportes.map(r => r.id).join(',') !== clave) return;
    const token  = ++this.cargaDia;
    const partes = await this.obraVm.cargarPartes(reportes);
    if (token === this.cargaDia) this.partesDia.set(partes);
  }

  // ── Historial ─────────────────────────────────────────────────────────────

  /** Elige un día: carga el detalle de todos sus partes. */
  async seleccionarDia(dia: DiaObra): Promise<void> {
    if (dia.fecha === this.fechaSel()) return;
    const token = ++this.cargaDia;
    this.fechaSel.set(dia.fecha);
    this.cargandoDia.set(true);
    try {
      const partes = await this.obraVm.cargarPartes(dia.partes);
      if (token === this.cargaDia) this.partesDia.set(partes);
    } finally {
      if (token === this.cargaDia) this.cargandoDia.set(false);
    }
  }

  // ── Media viewer ──────────────────────────────────────────────────────────

  abrirMedia(archivo: ReporteArchivoRow): void {
    const url = this.archivoService.publicUrl(archivo.url_storage);
    if (archivo.tipo === 'reporte_foto') {
      this.mediaViewer.set({ tipo: 'foto', url, nombre: archivo.nombre_archivo });
    } else if (archivo.tipo === 'reporte_video') {
      this.mediaViewer.set({ tipo: 'video', url, nombre: archivo.nombre_archivo });
    } else {
      window.open(url, '_blank');
    }
  }

  cerrarViewer(): void { this.mediaViewer.set(null); }
  publicUrl(path: string): string { return this.archivoService.publicUrl(path); }

  // ── Helpers de presentación ───────────────────────────────────────────────

  /** Todos los servicios del contrato; si no vienen, el principal como antes. */
  servicioNombre(): string {
    const o = this.obra();
    const lang = this.currentLang();
    if (o.servicios?.length) {
      return o.servicios.map(s => nombreServicio(s, lang)).join(' · ');
    }
    if (lang === 'en') return o.servicioNombreEn || o.servicioNombre;
    if (lang === 'fr') return o.servicioNombreFr || o.servicioNombre;
    return o.servicioNombre;
  }

  faseName(fase: FaseServicio): string {
    const lang = this.currentLang();
    if (lang === 'en') return fase.nombre_en;
    if (lang === 'fr') return fase.nombre_fr;
    return fase.nombre_es;
  }

  actividadName(act: ActividadServicio): string {
    const lang = this.currentLang();
    if (lang === 'en') return act.nombre_en;
    if (lang === 'fr') return act.nombre_fr;
    return act.nombre_es;
  }

  /** Nombre de la fase de un parte, sea del servicio que sea. */
  faseNameById(faseId: string | null): string {
    if (!faseId) return '';
    const o = this.obra();
    const f = o.fasesCatalogo.find(x => x.id === faseId) ?? o.fases.find(x => x.fase.id === faseId)?.fase;
    return f ? this.faseName(f) : '';
  }

  /** Nombre del servicio de un parte, en el idioma activo. */
  servicioNombreById(servicioId: number | null): string {
    if (servicioId == null) return '';
    const s = this.obra().servicios?.find(x => x.id === servicioId);
    return s ? nombreServicio(s, this.currentLang() ?? 'fr') : '';
  }

  badgeContrato(estado: string): string {
    return ({
      firmado:      'cm-badge--firmado',
      en_ejecucion: 'cm-badge--ejecucion',
      completado:   'cm-badge--completado',
      cancelado:    'cm-badge--cancelado',
    } as Record<string, string>)[estado] ?? '';
  }

  pasoActivo(key: string): boolean {
    const ord: Record<string, number> = { firmado: 1, en_ejecucion: 2, completado: 3 };
    return (ord[this.obra().estadoContrato] ?? 0) >= (ord[key] ?? 99);
  }

  esPasoActual(key: string): boolean { return this.obra().estadoContrato === key; }

  plazoLabel(): string {
    const o = this.obra();
    if (o.plazoMin == null && o.plazoMax == null) return '—';
    const sem = this.translate.instant('client_monitoring.semanas');
    if (o.plazoMin === o.plazoMax) return `${o.plazoMin} ${sem}`;
    return `${o.plazoMin ?? '?'}–${o.plazoMax ?? '?'} ${sem}`;
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

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(this.langLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  formatFechaHora(valor: string | null): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return this.formatFecha(valor);
    return new Intl.DateTimeFormat(this.langLocale(), {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  }

  horaCorta(valor: string | null): string {
    return valor ? valor.substring(0, 5) : '—';
  }

  private soloFecha(valor: string): string {
    return valor.includes('T') ? valor.split('T')[0] : valor;
  }

  private langLocale(): string {
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    return localeMap[this.currentLang() ?? this.translate.currentLang] ?? 'fr-CA';
  }
}
