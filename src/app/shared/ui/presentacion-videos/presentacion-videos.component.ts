import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LangService } from '../../../services/lang.service';
import { PerfilVideoService, VideoError } from '../../../services/perfil-video.service';
import { ToastService } from '../../../services/toast.service';
import { DbPerfilVideo } from '../../../types/supabase';
import { GrabacionTerminada, GrabadorVideoComponent } from './grabador-video.component';
import { ReproductorVideoComponent } from './reproductor-video.component';
import {
  TAMANO_MAX_BYTES, TIPOS_VIDEO, formatoDuracion, formatoRelativo, formatoTamano, leerMetadatos, nombreDescarga,
} from './grabacion';

type Orden = 'recientes' | 'antiguos' | 'titulo' | 'largos';

const ORDEN_KEY = 'e3d.videos.orden';

function leerOrden(): Orden {
  try {
    const v = localStorage.getItem(ORDEN_KEY) as Orden | null;
    return v && ['recientes', 'antiguos', 'titulo', 'largos'].includes(v) ? v : 'recientes';
  } catch {
    return 'recientes';
  }
}

interface Pendiente { clave: string; titulo: string; }

/**
 * Videos de presentación de un estimador o constructor: grabar (pantalla,
 * cámara o ambas) o subir varios, y la biblioteca para verlos, buscarlos,
 * ordenarlos, renombrarlos, descargarlos o eliminarlos.
 *
 * Cada acción se guarda al momento, fuera del formulario del perfil.
 */
@Component({
  selector: 'app-presentacion-videos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem,
    GrabadorVideoComponent, ReproductorVideoComponent,
  ],
  templateUrl: './presentacion-videos.component.html',
  styleUrl: './presentacion-videos.component.css',
})
export class PresentacionVideosComponent implements OnInit {
  private readonly service   = inject(PerfilVideoService);
  private readonly toast     = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang      = inject(LangService);

  readonly perfilId = input.required<string>();
  /** Nombre del usuario, para el texto de ayuda. */
  readonly nombre   = input('');
  /** El dueño gestiona sus propios videos (su perfil): la ayuda le habla a él. */
  readonly propio   = input(false);

  readonly claveAyuda = computed(() =>
    this.propio() ? 'presentation_videos.hint_self'
      : this.nombre() ? 'presentation_videos.hint_named' : 'presentation_videos.hint');

  private readonly grabador     = viewChild.required(GrabadorVideoComponent);
  private readonly archivoInput = viewChild.required<ElementRef<HTMLInputElement>>('archivoInput');
  private readonly dlgRenombrar = viewChild.required<ElementRef<HTMLDialogElement>>('dlgRenombrar');
  private readonly dlgEliminar  = viewChild.required<ElementRef<HTMLDialogElement>>('dlgEliminar');

  readonly maxTamano = formatoTamano(TAMANO_MAX_BYTES);

  readonly videos     = signal<DbPerfilVideo[]>([]);
  readonly miniaturas = signal<Record<string, string>>({});
  readonly cargando   = signal(true);
  readonly errorCarga = signal(false);
  readonly pendientes = signal<Pendiente[]>([]);
  readonly consulta   = signal('');
  readonly orden      = signal<Orden>(leerOrden());

  readonly abierto    = signal<DbPerfilVideo | null>(null);
  readonly renombrar  = signal<DbPerfilVideo | null>(null);
  readonly eliminar   = signal<DbPerfilVideo | null>(null);
  readonly ocupado    = signal(false);

  readonly ordenes: { valor: Orden; clave: string }[] = [
    { valor: 'recientes', clave: 'presentation_videos.sort.newest' },
    { valor: 'antiguos',  clave: 'presentation_videos.sort.oldest' },
    { valor: 'titulo',    clave: 'presentation_videos.sort.title' },
    { valor: 'largos',    clave: 'presentation_videos.sort.longest' },
  ];

  readonly visibles = computed(() => {
    const q = this.consulta().trim().toLocaleLowerCase(this.lang.current());
    const lista = q
      ? this.videos().filter(v => v.titulo.toLocaleLowerCase(this.lang.current()).includes(q))
      : [...this.videos()];
    const ordenes: Record<Orden, (a: DbPerfilVideo, b: DbPerfilVideo) => number> = {
      recientes: (a, b) => b.creado_en.localeCompare(a.creado_en),
      antiguos:  (a, b) => a.creado_en.localeCompare(b.creado_en),
      titulo:    (a, b) => a.titulo.localeCompare(b.titulo, this.lang.current()),
      largos:    (a, b) => b.duracion_ms - a.duracion_ms,
    };
    return lista.sort(ordenes[this.orden()]);
  });

  /** «3 videos» o, al buscar, «1 de 3 videos». */
  readonly resumen = computed(() => {
    const total = this.videos().length;
    if (!total) return '';
    const n = this.visibles().length;
    const clave = total === 1 ? 'presentation_videos.count_one' : 'presentation_videos.count_other';
    const totalTxt = this.translate.instant(clave, { n: total });
    return this.consulta().trim()
      ? this.translate.instant('presentation_videos.count_filtered', { n, total: totalTxt })
      : totalTxt;
  });

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.errorCarga.set(false);
    try {
      const videos = await this.service.listar(this.perfilId());
      this.videos.set(videos);
      this.miniaturas.set(await this.service.urlsMiniaturas(videos).catch(() => ({})));
    } catch (e) {
      console.error('[PresentacionVideos] listar:', e);
      this.errorCarga.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Formato ──────────────────────────────────────────────────────────────

  duracion(v: DbPerfilVideo): string { return formatoDuracion(v.duracion_ms); }
  relativo(v: DbPerfilVideo): string { return formatoRelativo(v.creado_en, this.lang.current()); }
  vistas(n: number): string {
    return this.translate.instant(n === 1 ? 'presentation_videos.views_one' : 'presentation_videos.views_other', { n });
  }

  cambiarOrden(valor: string): void {
    const o = valor as Orden;
    this.orden.set(o);
    try { localStorage.setItem(ORDEN_KEY, o); } catch { /* modo privado */ }
  }

  // ── Grabar ───────────────────────────────────────────────────────────────

  nuevaGrabacion(): void {
    void this.grabador().abrir();
  }

  async alGrabar(g: GrabacionTerminada): Promise<void> {
    const titulo = this.translate.instant('presentation_videos.default_title', {
      fecha: new Intl.DateTimeFormat(this.lang.current(), {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(new Date()),
    });
    const clave = crypto.randomUUID();
    this.pendientes.update(l => [{ clave, titulo }, ...l]);
    try {
      const meta = g.miniatura ? null : await leerMetadatos(g.blob);
      const video = await this.service.crear({
        perfilId:   this.perfilId(),
        titulo,
        archivo:    g.blob,
        miniatura:  g.miniatura ?? meta?.miniatura ?? null,
        duracionMs: g.duracionMs,
        ancho:      g.ancho,
        alto:       g.alto,
        origen:     'grabacion',
        modo:       g.modo,
      });
      await this.agregar(video);
      this.toast.show(this.translate.instant('presentation_videos.toast.saved'), 'success', 3000);
      this.abierto.set(video);
    } catch (e) {
      // La grabación no se pierde: se descarga en este equipo.
      this.descargarBlob(g.blob, nombreDescarga(titulo, g.blob.type));
      this.toast.show(
        `${this.mensajeError(e)} ${this.translate.instant('presentation_videos.errors.downloaded_copy')}`,
        'danger', 9000,
      );
    } finally {
      this.pendientes.update(l => l.filter(p => p.clave !== clave));
    }
  }

  // ── Subir ────────────────────────────────────────────────────────────────

  elegirArchivos(): void {
    this.archivoInput().nativeElement.click();
  }

  async alElegirArchivos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    // De uno en uno: varios a la vez saturan la subida y no ganan tiempo.
    for (const archivo of archivos) await this.subir(archivo);
  }

  private async subir(archivo: File): Promise<void> {
    const titulo = archivo.name.replace(/\.[^.]+$/, '').trim() || archivo.name;
    if (!TIPOS_VIDEO.includes(archivo.type)) {
      this.toast.show(this.translate.instant('presentation_videos.errors.formato_file', { nombre: archivo.name }), 'danger');
      return;
    }
    if (archivo.size > TAMANO_MAX_BYTES) {
      this.toast.show(this.translate.instant('presentation_videos.errors.muy_grande_file', {
        nombre: archivo.name, max: this.maxTamano,
      }), 'danger');
      return;
    }

    const clave = crypto.randomUUID();
    this.pendientes.update(l => [{ clave, titulo }, ...l]);
    try {
      const meta = await leerMetadatos(archivo);
      const video = await this.service.crear({
        perfilId:   this.perfilId(),
        titulo,
        archivo,
        miniatura:  meta.miniatura,
        duracionMs: meta.duracionMs,
        ancho:      meta.ancho,
        alto:       meta.alto,
        origen:     'subida',
        modo:       null,
      });
      await this.agregar(video);
      this.toast.show(this.translate.instant('presentation_videos.toast.uploaded', { nombre: titulo }), 'success', 3000);
    } catch (e) {
      this.toast.show(this.mensajeError(e), 'danger');
    } finally {
      this.pendientes.update(l => l.filter(p => p.clave !== clave));
    }
  }

  private async agregar(video: DbPerfilVideo): Promise<void> {
    this.videos.update(l => [video, ...l]);
    const urls = await this.service.urlsMiniaturas([video]).catch(() => ({}));
    this.miniaturas.update(m => ({ ...m, ...urls }));
  }

  private mensajeError(e: unknown): string {
    const code = e instanceof VideoError ? e.code : 'guardado';
    return this.translate.instant(`presentation_videos.errors.${code}`, { max: this.maxTamano });
  }

  // ── Ver ──────────────────────────────────────────────────────────────────

  ver(v: DbPerfilVideo): void {
    this.abierto.set(v);
  }

  alCambiar(v: DbPerfilVideo): void {
    this.videos.update(l => l.map(x => (x.id === v.id ? v : x)));
  }

  // ── Descargar ────────────────────────────────────────────────────────────

  async descargar(v: DbPerfilVideo): Promise<void> {
    try {
      const url = await this.service.urlVideo(v, nombreDescarga(v.titulo, v.mime_type));
      const a = Object.assign(document.createElement('a'), { href: url, rel: 'noopener' });
      document.body.append(a);
      a.click();
      a.remove();
    } catch {
      this.toast.show(this.translate.instant('presentation_videos.errors.download'), 'danger');
    }
  }

  private descargarBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ── Renombrar ────────────────────────────────────────────────────────────

  pedirRenombrar(v: DbPerfilVideo): void {
    this.renombrar.set(v);
    const dlg = this.dlgRenombrar().nativeElement;
    // Se escribe a mano: el binding llegaría después del `select()`.
    const input = dlg.querySelector('input');
    if (input) input.value = v.titulo;
    dlg.showModal();
    input?.select();
  }

  async confirmarRenombrar(e: Event, input: HTMLInputElement): Promise<void> {
    e.preventDefault();
    const v = this.renombrar();
    const titulo = input.value.trim().slice(0, 120);
    if (!v || !titulo) { input.focus(); return; }
    if (titulo === v.titulo) { this.dlgRenombrar().nativeElement.close(); return; }

    this.ocupado.set(true);
    try {
      await this.service.renombrar(v.id, titulo);
      this.alCambiar({ ...v, titulo });
      this.dlgRenombrar().nativeElement.close();
      this.toast.show(this.translate.instant('presentation_videos.toast.renamed'), 'success', 3000);
    } catch {
      this.toast.show(this.translate.instant('presentation_videos.errors.rename'), 'danger');
    } finally {
      this.ocupado.set(false);
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────

  pedirEliminar(v: DbPerfilVideo): void {
    this.eliminar.set(v);
    this.dlgEliminar().nativeElement.showModal();
  }

  async confirmarEliminar(): Promise<void> {
    const v = this.eliminar();
    if (!v) return;
    this.ocupado.set(true);
    try {
      await this.service.eliminar(v);
      this.videos.update(l => l.filter(x => x.id !== v.id));
      this.miniaturas.update(m => { const { [v.id]: _, ...resto } = m; return resto; });
      if (this.abierto()?.id === v.id) this.abierto.set(null);
      this.dlgEliminar().nativeElement.close();
      this.toast.show(this.translate.instant('presentation_videos.toast.deleted'), 'success', 3000);
    } catch {
      this.toast.show(this.translate.instant('presentation_videos.errors.delete'), 'danger');
    } finally {
      this.ocupado.set(false);
    }
  }

  cerrarDialogo(dlg: HTMLDialogElement): void {
    if (!this.ocupado()) dlg.close();
  }
}
