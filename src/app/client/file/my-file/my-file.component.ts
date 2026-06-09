import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ExpedienteService } from '../../../services/expediente.service';
import { OfertaService } from '../../../services/oferta.service';
import { ArchivoService, TipoArchivo } from '../../../services/archivo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteVistaCliente, OfertaConConstructor, ArchivoRow } from '../../../models';
import { ContratoRepository, ContratoClienteView } from '../../../data/contrato.repository';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';


@Component({
  selector: 'app-my-file',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private auth              = inject(AuthSupabaseService);
  private contratoRepo      = inject(ContratoRepository);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  private expedienteId = '';

  detalle        = signal<ExpedienteVistaCliente | null>(null);
  ofertaAceptada = signal<OfertaConConstructor | null>(null);
  fotos          = signal<ArchivoRow[]>([]);
  videos         = signal<ArchivoRow[]>([]);
  documentos     = signal<ArchivoRow[]>([]);
  contrato       = signal<ContratoClienteView | null>(null);
  fotoAmpliada   = signal<string | null>(null);
  cargando       = signal(true);
  errorMsg       = signal('');
  subiendo        = signal<TipoArchivo | null>(null);
  errorSubida     = signal('');
  contratoPdfUrl  = signal<string | null>(null);
  currentUserId   = signal<string | null>(null);
  eliminando      = signal<string | null>(null);

  misFotos    = computed(() => this.fotos().filter(f => f.subido_por === this.currentUserId()));
  misVideos   = computed(() => this.videos().filter(f => f.subido_por === this.currentUserId()));
  misDocs     = computed(() => this.documentos().filter(f => f.subido_por === this.currentUserId()));
  otrosFotos  = computed(() => this.fotos().filter(f => f.subido_por !== this.currentUserId()));
  otrosVideos = computed(() => this.videos().filter(f => f.subido_por !== this.currentUserId()));
  otrosDocs   = computed(() => this.documentos().filter(f => f.subido_por !== this.currentUserId()));

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
    this.expedienteId = id;

    try {
      const [detalle, ofertas, archivos, contrato, { data: { user } }] = await Promise.all([
        this.expedienteService.getVistaParaCliente(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
        this.contratoRepo.findForClientByExpedienteId(id),
        this.auth.client.auth.getUser(),
      ]);
      this.currentUserId.set(user?.id ?? null);
      this.detalle.set(detalle);
      this.ofertaAceptada.set(ofertas.find(o => o.estado === 'aceptada') ?? null);
      this.fotos.set(archivos.fotos);
      this.videos.set(archivos.videos);
      this.documentos.set(archivos.documentos);
      this.contrato.set(contrato);
      if (contrato?.url_pdf) {
        this.contratoRepo.getSignedUrl(contrato.url_pdf)
          .then(url => this.contratoPdfUrl.set(url))
          .catch(() => {});
      }
    } catch (e: any) {
      console.error('[MyFile]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async subirArchivo(tipo: TipoArchivo, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    const uid   = this.currentUserId();
    if (!file || !this.expedienteId || !uid) return;

    this.subiendo.set(tipo);
    this.errorSubida.set('');
    try {
      await this.archivoService.subir(this.expedienteId, tipo, file, uid);
      const archivos = await this.archivoService.cargarTodos(this.expedienteId);
      this.fotos.set(archivos.fotos);
      this.videos.set(archivos.videos);
      this.documentos.set(archivos.documentos);
      input.value = '';
    } catch (e: any) {
      this.errorSubida.set(e.message ?? 'upload_error');
    } finally {
      this.subiendo.set(null);
    }
  }

  async eliminarArchivo(archivo: ArchivoRow): Promise<void> {
    this.eliminando.set(archivo.id);
    this.errorSubida.set('');
    try {
      await this.archivoService.eliminar(archivo);
      const archivos = await this.archivoService.cargarTodos(this.expedienteId);
      this.fotos.set(archivos.fotos);
      this.videos.set(archivos.videos);
      this.documentos.set(archivos.documentos);
    } catch (e: any) {
      this.errorSubida.set(e.message ?? 'delete_error');
    } finally {
      this.eliminando.set(null);
    }
  }

  estadoCfg(estado: string) {
    return this.ESTADO_CFG[estado] ?? { clase: 'bg-secondary-subtle text-secondary', icono: 'bi-question-circle' };
  }

  get servicioNombre(): string {
    const d = this.detalle();
    if (!d) return '';
    const lang = this.translate.currentLang;
    if (lang === 'en') return d.servicio_nombre_en || d.servicio_nombre;
    if (lang === 'fr') return d.servicio_nombre_fr || d.servicio_nombre;
    return d.servicio_nombre;
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
