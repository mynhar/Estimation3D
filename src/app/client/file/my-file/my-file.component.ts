import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ExpedienteService } from '../../../services/expediente.service';
import { OfertaService } from '../../../services/oferta.service';
import { ArchivoService } from '../../../services/archivo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteVistaCliente, OfertaConConstructor, ArchivoRow } from '../../../models';


@Component({
  selector: 'app-my-file',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './my-file.component.html',
  styleUrl:    './my-file.component.css',
})
export class MyFileComponent implements OnInit {
  private sanitizer         = inject(DomSanitizer);
  private translate         = inject(TranslateService);
  private expedienteService = inject(ExpedienteService);
  private ofertaService     = inject(OfertaService);
  private archivoService    = inject(ArchivoService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  detalle        = signal<ExpedienteVistaCliente | null>(null);
  ofertaAceptada = signal<OfertaConConstructor | null>(null);
  fotos          = signal<ArchivoRow[]>([]);
  documentos     = signal<ArchivoRow[]>([]);
  fotoAmpliada   = signal<string | null>(null);
  cargando       = signal(true);
  errorMsg       = signal('');

  readonly ESTADO_CFG: Record<string, { clase: string; icono: string }> = {
    nuevo:         { clase: 'bg-primary-subtle text-primary',            icono: 'bi-inbox' },
    en_estimacion: { clase: 'bg-info-subtle text-info-emphasis',         icono: 'bi-clipboard2-pulse' },
    estimado:      { clase: 'bg-success-subtle text-success',            icono: 'bi-check-circle' },
    en_oferta:     { clase: 'bg-warning-subtle text-warning-emphasis',   icono: 'bi-cash-coin' },
    adjudicado:    { clase: 'bg-warning-subtle text-warning-emphasis',   icono: 'bi-trophy' },
    contratado:    { clase: 'bg-success-subtle text-success',            icono: 'bi-file-earmark-check' },
    cancelado:     { clase: 'bg-secondary-subtle text-secondary',        icono: 'bi-x-circle' },
  };

  readonly ESTADO_PROGRESO: Record<string, number> = {
    nuevo:         15,
    en_estimacion: 30,
    estimado:      50,
    en_oferta:     65,
    adjudicado:    80,
    contratado:    100,
    cancelado:     0,
  };

  readonly PASOS: { key: string; icon: string; tkey: string }[] = [
    { key: 'nuevo',         icon: 'bi-inbox',              tkey: 'pipeline.received' },
    { key: 'en_estimacion', icon: 'bi-clipboard2-pulse',   tkey: 'pipeline.review'   },
    { key: 'estimado',      icon: 'bi-check-circle',       tkey: 'state.estimado'    },
    { key: 'en_oferta',     icon: 'bi-cash-coin',          tkey: 'pipeline.offers'   },
    { key: 'adjudicado',    icon: 'bi-trophy',             tkey: 'pipeline.chosen'   },
    { key: 'contratado',    icon: 'bi-file-earmark-check', tkey: 'pipeline.signed'   },
  ];

  progreso(estado: string): number {
    return this.ESTADO_PROGRESO[estado] ?? 0;
  }

  pasoActivo(pasoKey: string, estadoActual: string): 'done' | 'active' | 'pending' {
    if (estadoActual === 'cancelado') return 'pending';
    const keys    = ['nuevo', 'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado'];
    const iActual = keys.indexOf(estadoActual);
    const iPaso   = keys.indexOf(pasoKey);
    if (iPaso < iActual)  return 'done';
    if (iPaso === iActual) return 'active';
    return 'pending';
  }

  get urlsTour(): string[] {
    const raw = this.detalle()?.url_tour ?? null;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch {}
    return [raw];
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }

    try {
      const [detalle, ofertas, archivos] = await Promise.all([
        this.expedienteService.getVistaParaCliente(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
      ]);
      this.detalle.set(detalle);
      this.ofertaAceptada.set(ofertas.find(o => o.estado === 'aceptada') ?? null);
      this.fotos.set(archivos.fotos);
      this.documentos.set(archivos.documentos);
    } catch (e: any) {
      console.error('[MyFile]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  estadoCfg(estado: string) {
    return this.ESTADO_CFG[estado] ?? { clase: 'bg-secondary-subtle text-secondary', icono: 'bi-question-circle' };
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
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

  formatHora(valor: string | null): string {
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(valor);
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() { this.fotoAmpliada.set(null); }

  volver() { this.router.navigate(['/client/file/my-files']); }
}
