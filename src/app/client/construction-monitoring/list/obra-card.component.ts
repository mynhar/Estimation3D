import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ArchivoService, ReporteArchivoRow } from '../../../services/archivo.service';
import { SeguimientoService } from '../../../services/seguimiento.service';
import { ReporteZona } from '../../../data/seguimiento.repository';
import {
  ActividadServicio,
  FaseServicio,
  ReporteDiario,
} from '../../../models/seguimiento.model';
import { ObraVM } from './obra.model';
import { ObraInspeccionesComponent } from './obra-inspecciones.component';

@Component({
  selector: 'app-obra-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ObraInspeccionesComponent],
  templateUrl: './obra-card.component.html',
  styleUrl: './obra-card.component.css',
  host: { '(document:keydown.escape)': 'cerrarViewer()' },
})
export class ObraCardComponent {
  obra = input.required<ObraVM>();

  private archivoService     = inject(ArchivoService);
  private seguimientoService = inject(SeguimientoService);
  private translate          = inject(TranslateService);

  currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang },
  );

  // Parte (día) seleccionado en el flujo de eventos.
  selected = signal<ReporteDiario | null>(null);
  // Detalle del día seleccionado (se recarga al cambiar de evento).
  zonas       = signal<ReporteZona[]>([]);
  fotos       = signal<ReporteArchivoRow[]>([]);
  videos      = signal<ReporteArchivoRow[]>([]);
  documentos  = signal<ReporteArchivoRow[]>([]);
  cargandoDia = signal(false);

  mediaViewer = signal<{ tipo: 'foto' | 'video'; url: string; nombre: string } | null>(null);

  readonly PASOS = [
    { key: 'firmado',      icon: 'bi-pen'           },
    { key: 'en_ejecucion', icon: 'bi-tools'         },
    { key: 'completado',   icon: 'bi-check2-circle' },
  ];

  // Id del último parte ya sembrado; evita re-sembrar (y perder la selección
  // manual del usuario) en recargas que no traen un parte nuevo para esta obra.
  private ultimoSembrado: string | null | undefined = undefined;

  // ── Ciclo de vida ───────────────────────────────────────────────────────────

  constructor() {
    // Siembra el día seleccionado al inicio y cada vez que llega un parte más
    // reciente (recarga en vivo). Si el último parte no cambió, no toca la
    // selección actual del usuario.
    effect(() => {
      const o = this.obra();
      const latestId = o.eventos[0]?.id ?? null;
      if (latestId === this.ultimoSembrado) return;
      this.ultimoSembrado = latestId;
      // El día inicial es el más reciente; su media/zonas ya vienen precargadas.
      this.selected.set(o.eventos[0] ?? null);
      this.zonas.set(o.zonas);
      this.fotos.set(o.fotos);
      this.videos.set(o.videos);
      this.documentos.set(o.documentos);
    }, { allowSignalWrites: true });
  }

  // ── Flujo de eventos ──────────────────────────────────────────────────────

  async seleccionarEvento(r: ReporteDiario): Promise<void> {
    if (r.id === this.selected()?.id) return;
    this.selected.set(r);
    this.cargandoDia.set(true);
    try {
      const [zonas, media] = await Promise.all([
        this.seguimientoService.getZonasReporte(r.id),
        this.archivoService.cargarPorReporte(r.id),
      ]);
      this.zonas.set(zonas);
      this.fotos.set(media.fotos);
      this.videos.set(media.videos);
      this.documentos.set(media.documentos);
    } finally {
      this.cargandoDia.set(false);
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

  servicioNombre(): string {
    const o = this.obra();
    const lang = this.currentLang();
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

  faseNameById(faseId: string | null): string {
    if (!faseId) return '';
    const f = this.obra().fases.find(x => x.fase.id === faseId)?.fase;
    return f ? this.faseName(f) : '';
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

  private langLocale(): string {
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    return localeMap[this.currentLang() ?? this.translate.currentLang] ?? 'fr-CA';
  }
}
