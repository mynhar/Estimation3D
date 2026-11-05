import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, signal, viewChild,
} from '@angular/core';
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

/** Lo que está en marcha; mientras tanto no se aceptan otras acciones. */
type Tarea = { tipo: 'subiendo'; titulo: string } | { tipo: 'guardando' } | { tipo: 'quitando' };

/**
 * Video con el que el estimador o el constructor se presenta en un expediente
 * (opcional).
 *
 * Lo graba (pantalla, cámara o ambas), lo sube o elige uno de su biblioteca.
 * Lo nuevo se guarda primero en la biblioteca (`perfil_video`) y después se
 * enlaza al expediente (`expediente_video`); quitarlo del expediente no lo
 * borra de la biblioteca. Cada acción se guarda al momento, fuera del
 * formulario de la estimación.
 *
 * Con `editable` en falso (p. ej. una oferta que ya no está pendiente) sólo
 * se ve el video que hay, sin acciones.
 */
@Component({
  selector: 'app-video-expediente',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, GrabadorVideoComponent, ReproductorVideoComponent],
  templateUrl: './video-expediente.component.html',
  styleUrls: ['./video-slot.css', './video-expediente.component.css'],
})
export class VideoExpedienteComponent implements OnInit {
  private readonly service   = inject(PerfilVideoService);
  private readonly toast     = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang      = inject(LangService);

  readonly expedienteId = input.required<string>();
  /** Quien se presenta (estimador o constructor): dueño de la biblioteca. */
  readonly perfilId     = input.required<string>();
  /** Número del expediente, para titular lo que se graba aquí. */
  readonly numero       = input('');
  /** Falso: sólo se ve el video que hay (sin grabar, subir, elegir ni quitar). */
  readonly editable     = input(true);

  private readonly grabador     = viewChild.required(GrabadorVideoComponent);
  private readonly archivoInput = viewChild.required<ElementRef<HTMLInputElement>>('archivoInput');
  private readonly dlgElegir    = viewChild.required<ElementRef<HTMLDialogElement>>('dlgElegir');

  readonly maxTamano = formatoTamano(TAMANO_MAX_BYTES);

  readonly actual     = signal<DbPerfilVideo | null>(null);
  readonly biblioteca = signal<DbPerfilVideo[]>([]);
  readonly miniaturas = signal<Record<string, string>>({});
  readonly cargando   = signal(true);
  readonly errorCarga = signal(false);
  readonly tarea      = signal<Tarea | null>(null);
  readonly abierto    = signal<DbPerfilVideo | null>(null);
  readonly elegido    = signal<string | null>(null);

  /** Los de la biblioteca que se pueden poner en lugar del actual. */
  readonly otros = computed(() => this.biblioteca().filter(v => v.id !== this.actual()?.id));
  readonly ocupado = computed(() => this.tarea() !== null);
  /** Título de lo que se está subiendo (grabación o archivo), si hay. */
  readonly subiendo = computed(() => {
    const t = this.tarea();
    return t?.tipo === 'subiendo' ? t.titulo : null;
  });

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.errorCarga.set(false);
    try {
      // Sin edición no hace falta la biblioteca: sólo el video del expediente.
      const [actual, biblioteca] = await Promise.all([
        this.service.deExpediente(this.expedienteId(), this.perfilId()),
        this.editable() ? this.service.listar(this.perfilId()) : Promise.resolve([]),
      ]);
      this.actual.set(actual);
      this.biblioteca.set(biblioteca);
      const conMiniatura = actual && !biblioteca.some(v => v.id === actual.id) ? [actual, ...biblioteca] : biblioteca;
      this.miniaturas.set(await this.service.urlsMiniaturas(conMiniatura).catch(() => ({})));
    } catch (e) {
      console.error('[VideoExpediente] cargar:', e);
      this.errorCarga.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Formato ──────────────────────────────────────────────────────────────

  duracion(v: DbPerfilVideo): string { return formatoDuracion(v.duracion_ms); }
  relativo(v: DbPerfilVideo): string { return formatoRelativo(v.creado_en, this.lang.current()); }
  origen(v: DbPerfilVideo): string {
    return v.modo ? `presentation_videos.mode.${v.modo}` : `presentation_videos.origin.${v.origen}`;
  }

  // ── Grabar ───────────────────────────────────────────────────────────────

  grabar(): void {
    if (this.editable() && !this.ocupado()) void this.grabador().abrir();
  }

  async alGrabar(g: GrabacionTerminada): Promise<void> {
    const titulo = this.numero()
      ? this.translate.instant('expediente_video.default_title', { numero: this.numero() })
      : this.translate.instant('presentation_videos.default_title', {
          fecha: new Intl.DateTimeFormat(this.lang.current(), {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          }).format(new Date()),
        });
    this.tarea.set({ tipo: 'subiendo', titulo });
    let video: DbPerfilVideo;
    try {
      const meta = g.miniatura ? null : await leerMetadatos(g.blob);
      video = await this.service.crear({
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
    } catch (e) {
      // La grabación no se pierde: se descarga en este equipo.
      this.tarea.set(null);
      this.descargarBlob(g.blob, nombreDescarga(titulo, g.blob.type));
      this.toast.show(
        `${this.mensajeError(e)} ${this.translate.instant('presentation_videos.errors.downloaded_copy')}`,
        'danger', 9000,
      );
      return;
    }
    await this.agregarYUsar(video);
  }

  // ── Subir ────────────────────────────────────────────────────────────────

  subir(): void {
    if (this.editable() && !this.ocupado()) this.archivoInput().nativeElement.click();
  }

  async alElegirArchivo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;

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

    const titulo = archivo.name.replace(/\.[^.]+$/, '').trim() || archivo.name;
    this.tarea.set({ tipo: 'subiendo', titulo });
    let video: DbPerfilVideo;
    try {
      const meta = await leerMetadatos(archivo);
      video = await this.service.crear({
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
    } catch (e) {
      this.tarea.set(null);
      this.toast.show(this.mensajeError(e), 'danger');
      return;
    }
    await this.agregarYUsar(video);
  }

  /** Lo recién creado entra en la biblioteca y pasa a ser el del expediente. */
  private async agregarYUsar(video: DbPerfilVideo): Promise<void> {
    this.biblioteca.update(l => [video, ...l]);
    const urls = await this.service.urlsMiniaturas([video]).catch(() => ({}));
    this.miniaturas.update(m => ({ ...m, ...urls }));
    // Ya está en la biblioteca: si falla el enlace, se puede elegir después.
    await this.usar(video, 'expediente_video.errors.attach_saved');
  }

  // ── Elegir de la biblioteca ──────────────────────────────────────────────

  abrirBiblioteca(): void {
    if (!this.editable() || this.ocupado()) return;
    this.elegido.set(this.otros()[0]?.id ?? null);
    this.dlgElegir().nativeElement.showModal();
  }

  async confirmarEleccion(e: Event): Promise<void> {
    e.preventDefault();
    const video = this.otros().find(v => v.id === this.elegido());
    if (!video) return;
    if (await this.usar(video, 'expediente_video.errors.attach')) {
      this.dlgElegir().nativeElement.close();
    }
  }

  cerrarBiblioteca(): void {
    if (!this.ocupado()) this.dlgElegir().nativeElement.close();
  }

  private async usar(video: DbPerfilVideo, claveError: string): Promise<boolean> {
    this.tarea.set({ tipo: 'guardando' });
    try {
      await this.service.usarEnExpediente(this.expedienteId(), this.perfilId(), video.id);
      this.actual.set(video);
      this.toast.show(this.translate.instant('expediente_video.toast.attached'), 'success', 3000);
      return true;
    } catch (e) {
      console.error('[VideoExpediente] usar:', e);
      this.toast.show(this.translate.instant(claveError), 'danger', 8000);
      return false;
    } finally {
      this.tarea.set(null);
    }
  }

  // ── Quitar ───────────────────────────────────────────────────────────────

  async quitar(): Promise<void> {
    if (!this.editable() || !this.actual() || this.ocupado()) return;
    this.tarea.set({ tipo: 'quitando' });
    try {
      await this.service.quitarDeExpediente(this.expedienteId(), this.perfilId());
      this.actual.set(null);
      this.toast.show(this.translate.instant('expediente_video.toast.removed'), 'success', 3000);
    } catch (e) {
      console.error('[VideoExpediente] quitar:', e);
      this.toast.show(this.translate.instant('expediente_video.errors.remove'), 'danger');
    } finally {
      this.tarea.set(null);
    }
  }

  // ── Ver ──────────────────────────────────────────────────────────────────

  /** El título se cambia desde el reproductor: se refleja aquí y en la lista. */
  alCambiar(v: DbPerfilVideo): void {
    this.biblioteca.update(l => l.map(x => (x.id === v.id ? v : x)));
    if (this.actual()?.id === v.id) this.actual.set(v);
  }

  private mensajeError(e: unknown): string {
    const code = e instanceof VideoError ? e.code : 'guardado';
    return this.translate.instant(`presentation_videos.errors.${code}`, { max: this.maxTamano });
  }

  private descargarBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
