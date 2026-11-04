import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender,
  computed, inject, output, signal, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../../services/toast.service';
import {
  DURACION_MAX_MS, ModoGrabacion, SesionGrabacion, abrirCamara, abrirMicro, capturarFotograma,
  detenerStream, formatoDuracion, pedirPantalla, puedeGrabar, puedeGrabarPantalla,
} from './grabacion';

/** Lo que el grabador entrega al terminar; el padre lo sube. */
export interface GrabacionTerminada {
  blob:       Blob;
  duracionMs: number;
  miniatura:  Blob | null;
  ancho:      number | null;
  alto:       number | null;
  modo:       ModoGrabacion;
}

type Fase = 'cerrado' | 'preparando' | 'cuenta' | 'grabando' | 'guardando';

/** Ventana flotante abierta: Document PiP (cámara + controles) o PiP de video (sólo cámara). */
type Ventana = { tipo: 'doc'; win: Window } | { tipo: 'video' };

interface Preferencias {
  modo: ModoGrabacion;
  camId: string;
  micId: string;
  audioSistema: boolean;
  tamBurbuja: number;
}

const PREFS_KEY = 'e3d.grabador';
const PIP_CAMARA = { width: 280, height: 280 };
const PIP_BARRA  = { width: 260, height: 64 };
const BURBUJA_MIN = 96;
const BURBUJA_MAX = 480;

interface DocumentPictureInPicture {
  requestWindow(opciones: { width: number; height: number }): Promise<Window>;
}

function leerPrefs(): Preferencias {
  const base: Preferencias = { modo: 'pantalla_camara', camId: '', micId: '', audioSistema: true, tamBurbuja: 200 };
  try {
    const guardado = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { ...base, ...guardado };
  } catch {
    return base;
  }
}

/**
 * Copia las hojas de estilo de la app a la ventana flotante: así su contenido
 * usa los mismos tokens `--ds-*`, fuentes e iconos que el resto de la página.
 */
function copiarEstilos(origen: Document, destino: Document): void {
  for (const hoja of Array.from(origen.styleSheets)) {
    try {
      if (hoja.href) {
        const link = destino.createElement('link');
        link.rel = 'stylesheet';
        link.href = hoja.href;
        destino.head.append(link);
        continue;
      }
      const style = destino.createElement('style');
      style.textContent = Array.from(hoja.cssRules).map(r => r.cssText).join('\n');
      destino.head.append(style);
    } catch { /* hoja de otro origen sin CORS: no se puede leer */ }
  }
}

/**
 * Grabador al estilo Loom: pantalla y cámara, sólo pantalla o sólo cámara.
 *
 * · Preparación en un `<dialog>`: modo, cámara, micrófono con medidor de nivel
 *   y audio del sistema opcional (si hay micro y sistema, se mezclan).
 * · Cuenta atrás de 3 s y barra de control: pausar, reanudar, terminar,
 *   descartar.
 * · Burbuja redonda de la cámara sobre la página: se arrastra y cambia de
 *   tamaño con − / + o con la rueda.
 * · Al cambiar de pestaña, cámara y controles pasan a una ventana flotante
 *   (Document Picture-in-Picture), que siempre es rectangular.
 * · Con la extensión de Chrome (carpeta `extension/`), la burbuja redonda y la
 *   barra se dibujan en cualquier pestaña y no hace falta la ventana flotante.
 *
 * Basado en «Capas» (mynhar.github.io/app-grabar-video-com).
 */
@Component({
  selector: 'app-grabador-video',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './grabador-video.component.html',
  styleUrl: './grabador-video.component.css',
  host: {
    '(window:message)':      'alMensaje($event)',
    '(window:beforeunload)': 'alSalir($event)',
    '(window:resize)':       'colocarBurbuja()',
  },
})
export class GrabadorVideoComponent {
  private readonly zone      = inject(NgZone);
  private readonly toast     = inject(ToastService);
  private readonly translate = inject(TranslateService);

  /** Grabación terminada y no vacía. */
  readonly grabado = output<GrabacionTerminada>();

  private readonly dialogo   = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly descarte  = viewChild.required<ElementRef<HTMLDialogElement>>('descarte');
  private readonly capa      = viewChild.required<ElementRef<HTMLDivElement>>('capa');
  private readonly flotanteEl= viewChild.required<ElementRef<HTMLDivElement>>('contenidoFlotante');
  private readonly pipFuente = viewChild.required<ElementRef<HTMLVideoElement>>('pipFuente');
  private readonly medidor   = viewChild<ElementRef<HTMLSpanElement>>('medidor');

  readonly maxTexto = formatoDuracion(DURACION_MAX_MS);
  readonly pantallaDisponible = puedeGrabarPantalla();

  readonly modos: { valor: ModoGrabacion; clave: string; icono: string }[] = [
    { valor: 'pantalla_camara', clave: 'presentation_videos.mode.pantalla_camara', icono: 'bi-person-video3' },
    { valor: 'pantalla',        clave: 'presentation_videos.mode.pantalla',        icono: 'bi-display' },
    { valor: 'camara',          clave: 'presentation_videos.mode.camara',          icono: 'bi-camera-video' },
  ];

  // ── Preferencias (sólo comodidad de este navegador) ──────────────────────
  private prefs = leerPrefs();
  readonly modo         = signal<ModoGrabacion>(this.prefs.modo);
  readonly camId        = signal(this.prefs.camId);
  readonly micId        = signal(this.prefs.micId);
  readonly audioSistema = signal(this.prefs.audioSistema);

  // ── Preparación ──────────────────────────────────────────────────────────
  readonly fase      = signal<Fase>('cerrado');
  readonly camaras   = signal<MediaDeviceInfo[]>([]);
  readonly micros    = signal<MediaDeviceInfo[]>([]);
  readonly streamCam = signal<MediaStream | null>(null);
  readonly streamMic = signal<MediaStream | null>(null);
  readonly errorCam  = signal<string | null>(null);
  readonly errorMic  = signal<string | null>(null);

  /** Valor mostrado en cada select: el dispositivo abierto, el preferido o «ninguno». */
  readonly camSeleccion = computed(() => this.seleccion(this.camaras(), this.streamCam(), this.camId()));
  readonly micSeleccion = computed(() => this.seleccion(this.micros(), this.streamMic(), this.micId()));

  readonly avisos = computed<string[]>(() => {
    const modo = this.modo();
    const lista: string[] = [];
    if (!this.pantallaDisponible) lista.push('presentation_videos.recorder.screen_unsupported');
    const ec = this.errorCam();
    if (modo !== 'pantalla' && ec) lista.push(`presentation_videos.recorder.cam_${ec}`);
    const em = this.errorMic();
    if (em) lista.push(`presentation_videos.recorder.mic_${em}`);
    else if (this.micId() === 'none' && (modo === 'camara' || !this.audioSistema())) {
      lista.push('presentation_videos.recorder.no_sound');
    }
    return lista;
  });

  readonly puedeEmpezar = computed(() =>
    this.fase() === 'preparando' && (this.modo() !== 'camara' || !!this.streamCam()));

  // ── Grabación ────────────────────────────────────────────────────────────
  private sesion: SesionGrabacion | null = null;
  readonly camaraSesion = signal<MediaStream | null>(null);
  readonly modoSesion   = signal<ModoGrabacion>('pantalla_camara');
  readonly cuenta       = signal<number | null>(null);
  readonly tiempoMs     = signal(0);
  readonly pausada      = signal(false);
  readonly camOculta    = signal(false);
  readonly flotante     = signal<'doc' | 'video' | null>(null);
  readonly hayExtension = signal(false);
  readonly burbuja      = signal({ x: -1, y: -1, tam: this.prefs.tamBurbuja });
  readonly arrastrando  = signal(false);

  readonly enCurso   = computed(() => ['cuenta', 'grabando', 'guardando'].includes(this.fase()));
  readonly guardando = computed(() => this.fase() === 'guardando');
  readonly tiempo    = computed(() => formatoDuracion(this.tiempoMs()));
  readonly restaPoco = computed(() => DURACION_MAX_MS - this.tiempoMs() <= 15_000);

  /** Con la extensión, la cámara vive en su burbuja y la ventana sólo lleva controles. */
  private readonly camEnVentana = computed(() => !this.hayExtension() && !!this.camaraSesion());

  readonly camaraEnPagina = computed(() => {
    if (!this.enCurso() || !this.camaraSesion()) return false;
    if (this.modoSesion() === 'camara') return true;
    return !this.camOculta() && !this.flotante() && !this.hayExtension();
  });
  readonly camaraEnFlotante = computed(() => this.flotante() === 'doc' && this.camEnVentana() && !this.camOculta());
  readonly puedeAlternarCam = computed(() => this.modoSesion() === 'pantalla_camara' && !!this.camaraSesion());
  readonly puedeFlotar = computed(() => {
    if (!this.enCurso() || this.modoSesion() === 'camara' || this.flotante()) return false;
    if ('documentPictureInPicture' in window) return true;
    return !this.camOculta() && this.camEnVentana() && document.pictureInPictureEnabled;
  });

  /** Flujo que alimenta el video oculto del PiP de video (plan B sin Document PiP). */
  readonly fuentePip = computed(() => this.camaraSesion() ?? this.streamCam());

  private ventana: Ventana | null = null;
  /** Tamaño de la ventana flotante antes de ocultar la cámara, para restaurarlo. */
  private tamVentana: [number, number] | null = null;
  /** Al pedir descartar se pausa; si se cancela, se reanuda sólo si grababa. */
  private estabaGrabando = false;
  private reloj = 0;
  private miniatura: Blob | null = null;
  private dimensiones: { width?: number; height?: number } | null = null;
  private tituloPrevio = '';
  private pararMedidor: (() => void) | null = null;
  private quitarDevicechange: (() => void) | null = null;

  constructor() {
    // La capa de grabación va a <body>: un `transform` en cualquier ancestro
    // convertiría su `position: fixed` en relativa a ese ancestro.
    afterNextRender(() => {
      document.body.append(this.capa().nativeElement);
      window.postMessage({ source: 'e3d-app', type: 'ping' }, location.origin);
    });

    inject(DestroyRef).onDestroy(() => {
      this.sesion?.cancelar();
      this.desmontar(false);
      this.liberarPreparacion();
      this.capa()?.nativeElement.remove();
    });
  }

  // ── API ──────────────────────────────────────────────────────────────────

  async abrir(): Promise<void> {
    if (this.fase() !== 'cerrado') return;
    if (!puedeGrabar()) {
      this.toast.show(this.translate.instant('presentation_videos.recorder.unsupported'), 'danger');
      return;
    }
    if (!this.pantallaDisponible) this.modo.set('camara');
    this.fase.set('preparando');
    this.dialogo().nativeElement.showModal();

    const alCambiar = () => { if (this.fase() === 'preparando') void this.llenarDispositivos(); };
    navigator.mediaDevices.addEventListener('devicechange', alCambiar);
    this.quitarDevicechange = () => navigator.mediaDevices.removeEventListener('devicechange', alCambiar);

    await this.sincronizarDispositivos();
  }

  cerrar(): void {
    this.dialogo().nativeElement.close();
  }

  /**
   * `close` del diálogo: Escape, botón Cancelar o el inicio de la grabación.
   * El evento llega asíncrono: si ya empezó la cuenta atrás, los flujos son
   * de la sesión y no se tocan.
   */
  alCerrarDialogo(): void {
    this.quitarDevicechange?.();
    this.quitarDevicechange = null;
    if (this.fase() !== 'preparando') return;
    this.liberarPreparacion();
    this.fase.set('cerrado');
  }

  // ── Preparación ──────────────────────────────────────────────────────────

  cambiarModo(modo: ModoGrabacion): void {
    this.modo.set(modo);
    this.guardarPrefs();
    void this.sincronizarDispositivos();
  }

  elegirCamara(id: string): void {
    this.camId.set(id);
    this.guardarPrefs();
    void this.sincronizarDispositivos();
  }

  elegirMicro(id: string): void {
    this.micId.set(id);
    this.guardarPrefs();
    void this.sincronizarDispositivos();
  }

  alternarAudioSistema(valor: boolean): void {
    this.audioSistema.set(valor);
    this.guardarPrefs();
  }

  etiquetaDispositivo(d: MediaDeviceInfo, i: number, tipo: 'cam' | 'mic'): string {
    if (d.label) return d.label;
    return this.translate.instant(`presentation_videos.recorder.${tipo}_n`, { n: i + 1 });
  }

  private seleccion(lista: MediaDeviceInfo[], stream: MediaStream | null, pref: string): string {
    if (pref === 'none' || !lista.length) return 'none';
    const abierto = stream?.getTracks()[0]?.getSettings().deviceId;
    return abierto || (lista.some(d => d.deviceId === pref) ? pref : lista[0].deviceId);
  }

  private guardarPrefs(): void {
    this.prefs = {
      modo: this.modo(), camId: this.camId(), micId: this.micId(),
      audioSistema: this.audioSistema(), tamBurbuja: this.burbuja().tam,
    };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* modo privado */ }
  }

  private async sincronizarDispositivos(): Promise<void> {
    const quiereCam = this.modo() !== 'pantalla' && this.camId() !== 'none';
    const quiereMic = this.micId() !== 'none';
    await Promise.all([
      quiereCam ? this.asegurar('cam') : this.soltar('cam'),
      quiereMic ? this.asegurar('mic') : this.soltar('mic'),
    ]);
    if (this.fase() !== 'preparando') return;
    await this.llenarDispositivos();
  }

  private vivo(stream: MediaStream | null, deviceId: string): boolean {
    const track = stream?.getTracks()[0];
    return track?.readyState === 'live' && (!deviceId || track.getSettings().deviceId === deviceId);
  }

  private async asegurar(tipo: 'cam' | 'mic'): Promise<void> {
    const deviceId = tipo === 'cam' ? this.camId() : this.micId();
    const actual   = tipo === 'cam' ? this.streamCam : this.streamMic;
    const error    = tipo === 'cam' ? this.errorCam  : this.errorMic;
    if (this.vivo(actual(), deviceId)) return;

    detenerStream(actual());
    actual.set(null);
    error.set(null);
    if (tipo === 'mic') this.detenerMedidor();

    let stream: MediaStream | null = null;
    try {
      stream = await (tipo === 'cam' ? abrirCamara(deviceId) : abrirMicro(deviceId));
    } catch (err) {
      const nombre = (err as DOMException).name;
      error.set(nombre === 'NotAllowedError' ? 'denied'
        : nombre === 'NotFoundError' || nombre === 'OverconstrainedError' ? 'missing'
        : 'busy');
    }
    // El diálogo se cerró mientras se abría: no dejar la cámara encendida.
    if (stream && this.fase() !== 'preparando') { detenerStream(stream); return; }
    actual.set(stream);
    if (tipo === 'mic' && stream) this.iniciarMedidor(stream);
  }

  private async soltar(tipo: 'cam' | 'mic'): Promise<void> {
    const actual = tipo === 'cam' ? this.streamCam : this.streamMic;
    detenerStream(actual());
    actual.set(null);
    (tipo === 'cam' ? this.errorCam : this.errorMic).set(null);
    if (tipo === 'mic') this.detenerMedidor();
  }

  private async llenarDispositivos(): Promise<void> {
    const todos = await navigator.mediaDevices.enumerateDevices();
    // Sin permiso los ids vienen vacíos: no se pueden elegir.
    this.camaras.set(todos.filter(d => d.kind === 'videoinput' && d.deviceId));
    this.micros.set(todos.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications'));
  }

  private liberarPreparacion(): void {
    this.detenerMedidor();
    detenerStream(this.streamCam());
    detenerStream(this.streamMic());
    this.streamCam.set(null);
    this.streamMic.set(null);
  }

  /** Medidor de nivel del micro. Va fuera de Angular: escribe el DOM a 60 fps. */
  private iniciarMedidor(stream: MediaStream): void {
    this.detenerMedidor();
    this.zone.runOutsideAngular(() => {
      const ctx = new AudioContext();
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analizador);
      const datos = new Uint8Array(analizador.fftSize);
      let raf = 0;
      const tic = () => {
        analizador.getByteTimeDomainData(datos);
        let pico = 0;
        for (const v of datos) pico = Math.max(pico, Math.abs(v - 128));
        const barra = this.medidor()?.nativeElement;
        if (barra) barra.style.transform = `scaleX(${Math.min(1, pico / 48)})`;
        raf = requestAnimationFrame(tic);
      };
      tic();
      this.pararMedidor = () => {
        cancelAnimationFrame(raf);
        void ctx.close();
        const barra = this.medidor()?.nativeElement;
        if (barra) barra.style.transform = 'scaleX(0)';
      };
    });
  }

  private detenerMedidor(): void {
    this.pararMedidor?.();
    this.pararMedidor = null;
  }

  // ── Inicio ───────────────────────────────────────────────────────────────

  /**
   * Clic en «Empezar grabación». Todo lo que exige activación del usuario
   * (pedir la pantalla, abrir la ventana flotante) se lanza aquí, de forma
   * síncrona, antes del primer `await`.
   */
  empezar(): void {
    const modo = this.modo();
    if (!this.puedeEmpezar()) return;

    const audioCtx = new AudioContext();
    void audioCtx.resume();
    const pantallaP = modo !== 'camara' ? pedirPantalla(this.audioSistema()) : Promise.resolve(null);
    // Sin cámara no hay burbuja: la ventana flotante es el único control fuera
    // de la pestaña, y sólo se puede abrir con este clic. La extensión ya
    // dibuja sus propios controles.
    const ventanaP = modo !== 'camara' && !this.streamCam() && !this.hayExtension()
      ? this.pedirVentana(false)
      : Promise.resolve(null);

    void this.arrancar(modo, audioCtx, pantallaP, ventanaP);
  }

  private async arrancar(
    modo: ModoGrabacion, audioCtx: AudioContext,
    pantallaP: Promise<MediaStream | null>, ventanaP: Promise<Ventana | null>,
  ): Promise<void> {
    let pantalla: MediaStream | null = null;
    try {
      pantalla = await pantallaP;
    } catch (err) {
      void audioCtx.close();
      this.cerrarVentana(await ventanaP);
      this.toast.show(this.translate.instant(
        (err as DOMException).name === 'NotAllowedError'
          ? 'presentation_videos.recorder.screen_denied'
          : 'presentation_videos.recorder.screen_failed',
      ), 'warning');
      return;
    }

    this.detenerMedidor();
    const camara = modo === 'pantalla' ? null : this.streamCam();
    if (modo === 'pantalla') detenerStream(this.streamCam());
    const sesion = new SesionGrabacion(modo, pantalla, camara, this.streamMic(), audioCtx);
    // La sesión es ahora la dueña de los flujos: el cierre del diálogo no los apaga.
    this.streamCam.set(null);
    this.streamMic.set(null);
    this.fase.set('cuenta');
    this.dialogo().nativeElement.close();

    this.sesion = sesion;
    this.camaraSesion.set(sesion.camara);
    this.modoSesion.set(modo);
    this.miniatura = null;
    this.dimensiones = null;
    this.tiempoMs.set(0);
    this.pausada.set(false);
    this.camOculta.set(false);
    this.tituloPrevio = document.title;
    this.colocarBurbuja();

    sesion.addEventListener('fin', () => this.zone.run(() => {
      if (sesion.estado === 'inactiva') this.cancelar(false);
      else void this.terminar();
    }));
    if (modo !== 'camara' && !this.hayExtension()) this.flotarAlSalir(true);

    this.adjuntarVentana(await ventanaP);
    if (this.sesion !== sesion) return;
    this.sincExt();

    if (!(await this.cuentaAtras(3, sesion))) return;
    try {
      sesion.iniciar();
    } catch {
      sesion.cancelar();
      this.desmontar();
      this.toast.show(this.translate.instant('presentation_videos.recorder.start_failed'), 'danger');
      return;
    }
    this.fase.set('grabando');
    const track = sesion.stream!.getVideoTracks()[0];
    this.dimensiones = track.getSettings();
    capturarFotograma(track)
      .then(b => { if (this.sesion === sesion) this.miniatura = b; })
      .catch(() => undefined);
    this.reloj = window.setInterval(() => this.tic(), 500);
    this.tic();
  }

  private async cuentaAtras(segundos: number, sesion: SesionGrabacion): Promise<boolean> {
    for (let i = segundos; i > 0 && this.sesion === sesion; i--) {
      this.cuenta.set(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    this.cuenta.set(null);
    return this.sesion === sesion;
  }

  private tic(): void {
    const s = this.sesion;
    if (!s || this.guardando()) return;
    const ms = s.tiempo;
    this.tiempoMs.set(Math.min(ms, DURACION_MAX_MS));
    const marca = s.estado === 'pausada' ? '❚❚' : '●';
    document.title = `${marca} ${formatoDuracion(ms)} · ${this.translate.instant('presentation_videos.recorder.recording')}`;
    if (ms >= DURACION_MAX_MS) {
      this.toast.show(this.translate.instant('presentation_videos.recorder.limit_reached', { max: this.maxTexto }), 'info');
      void this.terminar();
    }
  }

  // ── Controles ────────────────────────────────────────────────────────────

  alternarPausa(): void {
    const s = this.sesion;
    if (!s || this.guardando()) return;
    if (s.estado === 'grabando') s.pausar();
    else if (s.estado === 'pausada') s.reanudar();
    this.pausada.set(s.estado === 'pausada');
    this.tic();
    this.sincExt();
  }

  async terminar(): Promise<void> {
    const s = this.sesion;
    if (!s || this.guardando()) return;
    // Aún en la cuenta atrás: no hay nada grabado.
    if (s.estado === 'inactiva') { this.cancelar(false); return; }

    this.fase.set('guardando');
    this.sincExt();
    const { blob, duracionMs } = await s.detener();
    const miniatura = this.miniatura;
    const dims = this.dimensiones;
    const modo = s.modo;
    this.desmontar();

    if (!blob.size) {
      this.toast.show(this.translate.instant('presentation_videos.recorder.empty'), 'warning');
      return;
    }
    window.focus();
    this.grabado.emit({
      blob, duracionMs, miniatura, modo,
      ancho: dims?.width ?? null,
      alto:  dims?.height ?? null,
    });
  }

  /** Descartar desde la barra: pide confirmación y pausa mientras tanto. */
  pedirDescarte(): void {
    const s = this.sesion;
    if (!s || this.guardando()) return;
    if (s.estado === 'inactiva') { this.cancelar(false); return; }
    this.estabaGrabando = s.estado === 'grabando';
    if (this.estabaGrabando) this.alternarPausa();
    this.descarte().nativeElement.showModal();
  }

  confirmarDescarte(descartar: boolean): void {
    this.descarte().nativeElement.close();
    if (!this.sesion) return;
    if (descartar) { this.cancelar(true); return; }
    if (this.estabaGrabando && this.sesion.estado === 'pausada') this.alternarPausa();
  }

  cancelar(avisar: boolean): void {
    const s = this.sesion;
    if (!s || this.guardando()) return;
    s.cancelar();
    this.desmontar();
    this.toast.show(this.translate.instant(
      avisar ? 'presentation_videos.recorder.discarded' : 'presentation_videos.recorder.cancelled',
    ), 'info');
  }

  alternarCamara(): void {
    if (!this.puedeAlternarCam()) return;
    this.camOculta.update(v => !v);
    const v = this.ventana;
    if (v?.tipo === 'doc' && this.camEnVentana()) {
      const win = v.win;
      const marcoW = win.outerWidth - win.innerWidth;
      const marcoH = win.outerHeight - win.innerHeight;
      if (this.camOculta()) {
        this.tamVentana = [win.outerWidth, win.outerHeight];
        this.redimensionar(win, PIP_BARRA.width + marcoW, PIP_BARRA.height + marcoH);
      } else {
        const [w, h] = this.tamVentana ?? [PIP_CAMARA.width + marcoW, PIP_CAMARA.height + marcoH];
        this.redimensionar(win, w, h);
      }
    } else if (v?.tipo === 'video' && this.camOculta()) {
      this.cerrarVentana(v);
    }
    if (!this.camOculta()) this.colocarBurbuja();
    this.reproducirVideos();
    this.sincExt();
  }

  /** Desmonta la interfaz de grabación. La sesión ya está detenida o cancelada. */
  private desmontar(conTitulo = true): void {
    clearInterval(this.reloj);
    this.flotarAlSalir(false);
    const v = this.ventana;
    this.ventana = null;
    this.cerrarVentana(v);
    this.sesion = null;
    this.camaraSesion.set(null);
    this.cuenta.set(null);
    this.pausada.set(false);
    this.camOculta.set(false);
    this.flotante.set(null);
    this.tamVentana = null;
    this.miniatura = null;
    this.dimensiones = null;
    this.fase.set('cerrado');
    if (conTitulo && this.tituloPrevio) document.title = this.tituloPrevio;
    this.sincExt();
  }

  alSalir(e: BeforeUnloadEvent): void {
    if (this.sesion) e.preventDefault();
  }

  // ── Burbuja de la cámara ─────────────────────────────────────────────────

  colocarBurbuja(): void {
    const max = Math.max(BURBUJA_MIN, Math.min(BURBUJA_MAX, innerWidth - 32, innerHeight - 32));
    this.burbuja.update(b => {
      const tam = Math.round(Math.min(max, Math.max(BURBUJA_MIN, b.tam)));
      let { x, y } = b;
      if (x < 0 || y < 0) { x = 24; y = innerHeight - tam - 96; }
      x = Math.round(Math.min(innerWidth - tam - 8, Math.max(8, x)));
      y = Math.round(Math.min(innerHeight - tam - 8, Math.max(8, y)));
      return { x, y, tam };
    });
  }

  redimensionarBurbuja(delta: number): void {
    const antes = this.burbuja().tam;
    this.burbuja.update(b => ({ ...b, tam: b.tam + delta }));
    this.colocarBurbuja();
    // Crece desde el centro, no desde la esquina.
    const crecio = this.burbuja().tam - antes;
    this.burbuja.update(b => ({ ...b, x: b.x - crecio / 2, y: b.y - crecio / 2 }));
    this.colocarBurbuja();
    this.guardarPrefs();
  }

  alRueda(e: WheelEvent): void {
    if (this.modoSesion() === 'camara') return;
    e.preventDefault();
    this.redimensionarBurbuja(e.deltaY < 0 ? 16 : -16);
  }

  alPresionarBurbuja(e: PointerEvent): void {
    if (this.modoSesion() === 'camara' || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const el = e.currentTarget as HTMLElement;
    const inicio = { px: e.clientX, py: e.clientY, x: this.burbuja().x, y: this.burbuja().y };
    el.setPointerCapture(e.pointerId);
    this.arrastrando.set(true);
    const mover = (ev: PointerEvent) => {
      this.burbuja.update(b => ({ ...b, x: inicio.x + ev.clientX - inicio.px, y: inicio.y + ev.clientY - inicio.py }));
      this.colocarBurbuja();
    };
    const soltar = () => {
      this.arrastrando.set(false);
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  }

  /** Teclado: flechas mueven la burbuja, + / − cambian su tamaño. */
  alTeclaBurbuja(e: KeyboardEvent): void {
    const paso = e.shiftKey ? 48 : 16;
    const mov: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    if (mov[e.key]) {
      e.preventDefault();
      const [dx, dy] = mov[e.key];
      this.burbuja.update(b => ({ ...b, x: b.x + dx, y: b.y + dy }));
      this.colocarBurbuja();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.redimensionarBurbuja(40);
    } else if (e.key === '-') {
      e.preventDefault();
      this.redimensionarBurbuja(-40);
    }
  }

  // ── Ventana flotante (Picture-in-Picture) ────────────────────────────────

  private pedirVentana(conCamara: boolean): Promise<Ventana | null> {
    const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
    if (dpip) {
      return dpip.requestWindow(conCamara ? PIP_CAMARA : PIP_BARRA)
        .then(win => ({ tipo: 'doc' as const, win }))
        .catch(() => null);
    }
    const v = this.pipFuente().nativeElement;
    if (conCamara && document.pictureInPictureEnabled && v.readyState >= 1) {
      return v.requestPictureInPicture().then(() => ({ tipo: 'video' as const })).catch(() => null);
    }
    return Promise.resolve(null);
  }

  private cerrarVentana(v: Ventana | null): void {
    if (v?.tipo === 'doc') v.win.close();
    if (v?.tipo === 'video' && document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
  }

  /** Botón «Controles flotantes» de la barra, o el cambio de pestaña (Chrome 120+). */
  async flotar(manual: boolean): Promise<void> {
    const s = this.sesion;
    if (!s || this.ventana || this.guardando()) return;
    const v = await this.pedirVentana(this.camEnVentana() && !this.camOculta());
    if (this.sesion !== s) { this.cerrarVentana(v); return; }
    if (!v) {
      if (manual) this.toast.show(this.translate.instant('presentation_videos.recorder.float_failed'), 'warning');
      return;
    }
    this.adjuntarVentana(v);
  }

  /**
   * Chrome llama a este manejador cuando se cambia de pestaña mientras la
   * página usa cámara o micro, y le concede la activación que pide
   * `requestWindow()`. Al volver a la pestaña, cierra la ventana él mismo.
   */
  private flotarAlSalir(activo: boolean): void {
    try {
      navigator.mediaSession?.setActionHandler(
        'enterpictureinpicture' as MediaSessionAction,
        activo ? () => this.zone.run(() => void this.flotar(false)) : null,
      );
    } catch { /* acción no soportada */ }
  }

  private adjuntarVentana(v: Ventana | null): void {
    if (!v) return;
    this.ventana = v;
    const alCerrarse = () => this.zone.run(() => {
      if (this.ventana !== v) return;
      this.ventana = null;
      this.flotante.set(null);
      if (this.sesion) this.colocarBurbuja();
      this.reproducirVideos();
    });

    if (v.tipo === 'video') {
      this.pipFuente().nativeElement.addEventListener('leavepictureinpicture', alCerrarse, { once: true });
      this.flotante.set('video');
      return;
    }

    const doc = v.win.document;
    const contenido = this.flotanteEl().nativeElement;
    doc.title = this.translate.instant('presentation_videos.recorder.recording');
    copiarEstilos(document, doc);
    doc.body.append(contenido);
    // Antes de que el documento muera, el contenido vuelve a la capa.
    v.win.addEventListener('pagehide', () => {
      this.capa()?.nativeElement.append(contenido);
      alCerrarse();
    });
    this.flotante.set('doc');
    this.reproducirVideos();
  }

  redimensionarVentana(delta: number): void {
    const v = this.ventana;
    if (v?.tipo !== 'doc' || this.camOculta()) return;
    const win = v.win;
    const marcoW = win.outerWidth - win.innerWidth;
    const marcoH = win.outerHeight - win.innerHeight;
    const lado = Math.min(
      screen.availHeight - marcoH,
      Math.max(200, Math.max(win.innerWidth, win.innerHeight) + delta),
    );
    this.redimensionar(win, lado + marcoW, lado + marcoH);
  }

  private redimensionar(win: Window, w: number, h: number): void {
    try { win.resizeTo(Math.round(w), Math.round(h)); } catch { /* sin activación */ }
  }

  /** Un `<video>` movido de documento se pausa: hay que volver a darle play. */
  private reproducirVideos(): void {
    queueMicrotask(() => {
      const raices = [this.capa()?.nativeElement, this.flotanteEl()?.nativeElement];
      for (const r of raices) r?.querySelectorAll('video').forEach(v => { if (v.srcObject) void v.play().catch(() => undefined); });
    });
  }

  // ── Extensión de Chrome ──────────────────────────────────────────────────
  //
  // El script puente de la extensión (extension/bridge.js) responde al ping,
  // recibe el estado de la grabación y devuelve los clics de su burbuja.

  alMensaje(e: MessageEvent): void {
    if (e.source !== window || e.data?.source !== 'e3d-ext') return;
    if (e.data.type === 'hello' && !this.hayExtension()) {
      this.hayExtension.set(true);
      // Con la extensión, la ventana flotante deja de hacer falta.
      this.flotarAlSalir(false);
      this.sincExt();
    }
    if (e.data.type === 'cmd') {
      if (e.data.cmd === 'pause') this.alternarPausa();
      if (e.data.cmd === 'stop')  void this.terminar();
      if (e.data.cmd === 'cam')   this.alternarCamara();
    }
  }

  private sincExt(): void {
    if (!this.hayExtension()) return;
    const s = this.sesion;
    const estado = s && s.modo !== 'camara' ? {
      status: this.guardando() ? 'saving'
        : s.estado === 'grabando' ? 'recording'
        : s.estado === 'pausada' ? 'paused' : 'idle',
      elapsed:    s.tiempo,
      at:         Date.now(),
      max:        DURACION_MAX_MS,
      camera:     !!s.camara,
      camVisible: !!s.camara && !this.camOculta(),
      camLabel:   s.camara?.getVideoTracks()[0]?.label ?? '',
      labels: {
        pause:  this.translate.instant('presentation_videos.recorder.pause'),
        resume: this.translate.instant('presentation_videos.recorder.resume'),
        stop:   this.translate.instant('presentation_videos.recorder.finish'),
        camOn:  this.translate.instant('presentation_videos.recorder.show_camera'),
        camOff: this.translate.instant('presentation_videos.recorder.hide_camera'),
        saving: this.translate.instant('presentation_videos.recorder.saving'),
      },
    } : null;
    window.postMessage({ source: 'e3d-app', type: 'state', state: estado }, location.origin);
  }
}
