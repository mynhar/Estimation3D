import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output,
  signal, untracked, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LangService } from '../../../services/lang.service';
import { PerfilVideoService } from '../../../services/perfil-video.service';
import { ToastService } from '../../../services/toast.service';
import { DbPerfilVideo } from '../../../types/supabase';
import { extensionDeMime, formatoDuracion, formatoTamano } from './grabacion';

/**
 * Reproductor de un video de presentación, en un `<dialog>`: título editable,
 * velocidad de reproducción, contador de vistas y ficha técnica del archivo.
 *
 * Se abre al recibir un `video` y avisa con `cerrado` al cerrarse. El título y
 * las vistas los guarda él mismo y los devuelve con `cambiado`; descargar y
 * eliminar los resuelve el padre (son las mismas acciones del menú de la
 * biblioteca). Con `soloLectura` (el video de otra persona) sólo se ve: ni
 * título editable, ni acciones, ni vistas.
 */
@Component({
  selector: 'app-reproductor-video',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './reproductor-video.component.html',
  styleUrl: './reproductor-video.component.css',
})
export class ReproductorVideoComponent {
  private readonly service   = inject(PerfilVideoService);
  private readonly toast     = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang      = inject(LangService);

  readonly video     = input<DbPerfilVideo | null>(null);
  /** Descargar y eliminar: sólo desde la biblioteca, no donde el video sólo se usa. */
  readonly acciones  = input(true);
  /** El video es de otra persona: se ve, pero no se cambia ni cuenta vistas. */
  readonly soloLectura = input(false);
  readonly cerrado   = output<void>();
  readonly cambiado  = output<DbPerfilVideo>();
  readonly descargar = output<DbPerfilVideo>();
  readonly eliminar  = output<DbPerfilVideo>();

  private readonly dialogo     = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly reproductor = viewChild<ElementRef<HTMLVideoElement>>('reproductor');

  readonly velocidades = [0.5, 1, 1.25, 1.5, 2];

  /** Copia local: el título y las vistas cambian aquí antes de llegar al padre. */
  readonly actual     = signal<DbPerfilVideo | null>(null);
  readonly url        = signal<string | null>(null);
  readonly cargando   = signal(false);
  readonly errorCarga = signal(false);
  readonly velocidad  = signal(1);
  readonly guardandoTitulo = signal(false);
  private readonly resolucionLeida = signal<string | null>(null);

  private idAbierto: string | null = null;
  private vistaContada = false;

  readonly fecha = computed(() => {
    const v = this.actual();
    if (!v) return '';
    return new Intl.DateTimeFormat(this.lang.current(), { dateStyle: 'long', timeStyle: 'short' })
      .format(new Date(v.creado_en));
  });

  readonly detalles = computed(() => {
    const v = this.actual();
    if (!v) return [];
    const res = v.ancho && v.alto ? `${v.ancho} × ${v.alto}` : (this.resolucionLeida() ?? '—');
    const contenido = v.origen === 'subida'
      ? 'presentation_videos.origin.subida'
      : v.modo ? `presentation_videos.mode.${v.modo}` : 'presentation_videos.origin.grabacion';
    return [
      { clave: 'presentation_videos.player.duration',   valor: formatoDuracion(v.duracion_ms), traducir: false },
      { clave: 'presentation_videos.player.size',       valor: formatoTamano(v.tamano_bytes), traducir: false },
      { clave: 'presentation_videos.player.resolution', valor: res, traducir: false },
      { clave: 'presentation_videos.player.format',     valor: extensionDeMime(v.mime_type).toUpperCase(), traducir: false },
      { clave: 'presentation_videos.player.content',    valor: contenido, traducir: true },
    ];
  });

  constructor() {
    effect(() => {
      const v = this.video();
      untracked(() => {
        if (!v) { if (this.idAbierto) this.dialogo().nativeElement.close(); return; }
        if (v.id !== this.idAbierto) void this.abrir(v);
      });
    }, { allowSignalWrites: true });
  }

  private async abrir(v: DbPerfilVideo): Promise<void> {
    this.idAbierto = v.id;
    this.vistaContada = false;
    this.actual.set(v);
    this.url.set(null);
    this.errorCarga.set(false);
    this.resolucionLeida.set(null);
    this.cargando.set(true);
    const dlg = this.dialogo().nativeElement;
    if (!dlg.open) dlg.showModal();
    try {
      const url = await this.service.urlVideo(v);
      if (this.idAbierto === v.id) this.url.set(url);
    } catch {
      if (this.idAbierto === v.id) this.errorCarga.set(true);
    } finally {
      if (this.idAbierto === v.id) this.cargando.set(false);
    }
  }

  cerrar(): void {
    this.dialogo().nativeElement.close();
  }

  alCerrar(): void {
    this.reproductor()?.nativeElement.pause();
    this.idAbierto = null;
    this.url.set(null);
    this.actual.set(null);
    this.cerrado.emit();
  }

  // ── Video ────────────────────────────────────────────────────────────────

  alCargarMetadatos(): void {
    const el = this.reproductor()?.nativeElement;
    if (!el) return;
    el.playbackRate = el.defaultPlaybackRate = this.velocidad();
    if (el.videoWidth) this.resolucionLeida.set(`${el.videoWidth} × ${el.videoHeight}`);
    // Los WebM de MediaRecorder no traen duración: un salto al final la
    // calcula y la barra de progreso vuelve a funcionar.
    if (Number.isFinite(el.duration)) return;
    el.currentTime = 1e101;
    el.addEventListener('timeupdate', () => { el.currentTime = 0; }, { once: true });
  }

  async alReproducir(): Promise<void> {
    const v = this.actual();
    if (!v || this.vistaContada || this.soloLectura()) return;
    this.vistaContada = true;
    const total = await this.service.registrarVista(v.id);
    if (total == null || this.idAbierto !== v.id) return;
    const nuevo = { ...v, vistas: total };
    this.actual.set(nuevo);
    this.cambiado.emit(nuevo);
  }

  cambiarVelocidad(r: number): void {
    this.velocidad.set(r);
    const el = this.reproductor()?.nativeElement;
    if (el) el.playbackRate = el.defaultPlaybackRate = r;
  }

  // ── Título ───────────────────────────────────────────────────────────────

  async guardarTitulo(input: HTMLInputElement): Promise<void> {
    const v = this.actual();
    if (!v) return;
    const titulo = input.value.trim().slice(0, 120);
    if (!titulo) { input.value = v.titulo; return; }
    if (titulo === v.titulo) return;

    this.guardandoTitulo.set(true);
    try {
      await this.service.renombrar(v.id, titulo);
      const nuevo = { ...v, titulo };
      this.actual.set(nuevo);
      this.cambiado.emit(nuevo);
      this.toast.show(this.translate.instant('presentation_videos.toast.renamed'), 'success', 3000);
    } catch {
      input.value = v.titulo;
      this.toast.show(this.translate.instant('presentation_videos.errors.rename'), 'danger');
    } finally {
      this.guardandoTitulo.set(false);
    }
  }

  /** Escape en el título lo restaura sin cerrar el diálogo. */
  revertirTitulo(e: Event, input: HTMLInputElement): void {
    e.preventDefault();
    e.stopPropagation();
    input.value = this.actual()?.titulo ?? '';
    input.blur();
  }

  // ── Acciones del padre ───────────────────────────────────────────────────

  pedirDescarga(): void {
    const v = this.actual();
    if (v) this.descargar.emit(v);
  }

  pedirEliminar(): void {
    const v = this.actual();
    if (!v) return;
    this.cerrar();
    this.eliminar.emit(v);
  }

  vistasTexto(n: number): string {
    return this.translate.instant(
      n === 1 ? 'presentation_videos.views_one' : 'presentation_videos.views_other', { n },
    );
  }
}
