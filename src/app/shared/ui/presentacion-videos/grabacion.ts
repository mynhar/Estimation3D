/**
 * Motor de grabación del video de presentación: captura de pantalla y cámara,
 * mezcla de audio, MediaRecorder y miniaturas. Sin Angular: el componente
 * grabador lo envuelve en signals.
 *
 * Basado en el grabador «Capas» (mynhar.github.io/app-grabar-video-com).
 */

export type ModoGrabacion = 'pantalla_camara' | 'pantalla' | 'camara';
export type EstadoSesion  = 'inactiva' | 'grabando' | 'pausada' | 'detenida';

/** Un video de presentación es corto: a los 3 min la grabación se termina sola. */
export const DURACION_MAX_MS = 3 * 60_000;
/** Límite del bucket `presentaciones` (y del plan de Supabase). */
export const TAMANO_MAX_BYTES = 50 * 1024 * 1024;
/** ~2 Mb/s de video + 128 kb/s de audio: 3 min caben de sobra en 50 MB. */
const BITS_VIDEO = 2_000_000;
const BITS_AUDIO = 128_000;

export const puedeGrabar = (): boolean =>
  typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

export const puedeGrabarPantalla = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

export const detenerStream = (stream: MediaStream | null | undefined): void =>
  stream?.getTracks().forEach(t => t.stop());

function elegirMime(): string {
  const candidatos = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  return candidatos.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

/**
 * Abre un dispositivo concreto y, si ya no existe (se desconectó, cambió de
 * id), cae en el predeterminado. Un permiso denegado no se reintenta.
 */
async function abrirDispositivo(
  tipo: 'video' | 'audio', deviceId: string, base: MediaTrackConstraints,
): Promise<MediaStream> {
  const restricciones = (extra: MediaTrackConstraints) => ({ [tipo]: { ...base, ...extra } });
  try {
    return await navigator.mediaDevices.getUserMedia(
      restricciones(deviceId ? { deviceId: { exact: deviceId } } : {}),
    );
  } catch (err) {
    if (!deviceId || (err as DOMException).name === 'NotAllowedError') throw err;
    return navigator.mediaDevices.getUserMedia(restricciones({}));
  }
}

export const abrirCamara = (deviceId: string) =>
  abrirDispositivo('video', deviceId, { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });

export const abrirMicro = (deviceId: string) =>
  abrirDispositivo('audio', deviceId, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });

/** Pide la pantalla. Se llama de forma síncrona dentro del clic: necesita activación del usuario. */
export function pedirPantalla(conAudio: boolean): Promise<MediaStream> {
  const opciones = {
    video: { displaySurface: 'monitor', frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: conAudio,
    monitorTypeSurfaces: 'include',
    selfBrowserSurface:  'include',
    surfaceSwitching:    'include',
    systemAudio:         conAudio ? 'include' : 'exclude',
  };
  return navigator.mediaDevices.getDisplayMedia(opciones as DisplayMediaStreamOptions);
}

export interface ResultadoGrabacion {
  blob: Blob;
  duracionMs: number;
}

/**
 * Una grabación en curso. Emite `fin` cuando la fuente de video se corta desde
 * fuera (el usuario pulsa «Dejar de compartir» del navegador, o desenchufa la
 * cámara).
 */
export class SesionGrabacion extends EventTarget {
  estado: EstadoSesion = 'inactiva';
  stream: MediaStream | null = null;

  private recorder: MediaRecorder | null = null;
  private trozos: Blob[] = [];
  private acumulado = 0;
  private desde = 0;

  constructor(
    readonly modo: ModoGrabacion,
    readonly pantalla: MediaStream | null,
    readonly camara: MediaStream | null,
    readonly micro: MediaStream | null,
    private readonly audioCtx: AudioContext,
  ) {
    super();
    const fuente = modo === 'camara' ? camara : pantalla;
    fuente?.getVideoTracks()[0]?.addEventListener('ended', () => this.dispatchEvent(new Event('fin')));
  }

  /** Video de la fuente + el audio: uno tal cual, o micro y sistema mezclados. */
  private construirStream(): MediaStream {
    const video = (this.modo === 'camara' ? this.camara : this.pantalla)!.getVideoTracks()[0];
    const fuentes = [this.micro, this.pantalla].filter(
      (s): s is MediaStream => !!s && s.getAudioTracks().length > 0,
    );
    let audio: MediaStreamTrack[] = [];
    if (fuentes.length === 1) {
      audio = fuentes[0].getAudioTracks();
    } else if (fuentes.length > 1) {
      const destino = this.audioCtx.createMediaStreamDestination();
      fuentes.forEach(s => this.audioCtx.createMediaStreamSource(s).connect(destino));
      audio = destino.stream.getAudioTracks();
    }
    return new MediaStream([video, ...audio]);
  }

  iniciar(): void {
    this.stream = this.construirStream();
    const mimeType = elegirMime();
    this.recorder = new MediaRecorder(this.stream, {
      ...(mimeType && { mimeType }),
      videoBitsPerSecond: BITS_VIDEO,
      audioBitsPerSecond: BITS_AUDIO,
    });
    this.recorder.ondataavailable = e => { if (e.data.size) this.trozos.push(e.data); };
    this.recorder.start(1000);
    this.desde = performance.now();
    this.estado = 'grabando';
  }

  /** Tiempo grabado en ms, sin contar las pausas. */
  get tiempo(): number {
    return this.acumulado + (this.estado === 'grabando' ? performance.now() - this.desde : 0);
  }

  pausar(): void {
    if (this.estado !== 'grabando' || !this.recorder) return;
    this.recorder.pause();
    this.acumulado += performance.now() - this.desde;
    this.estado = 'pausada';
  }

  reanudar(): void {
    if (this.estado !== 'pausada' || !this.recorder) return;
    this.recorder.resume();
    this.desde = performance.now();
    this.estado = 'grabando';
  }

  detener(): Promise<ResultadoGrabacion> {
    const duracionMs = Math.min(this.tiempo, DURACION_MAX_MS);
    this.estado = 'detenida';
    const recorder = this.recorder;
    if (!recorder) {
      this.liberar();
      return Promise.resolve({ blob: new Blob([]), duracionMs: 0 });
    }
    return new Promise(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(this.trozos, { type: recorder.mimeType || 'video/webm' });
        this.liberar();
        resolve({ blob, duracionMs });
      };
      recorder.stop();
    });
  }

  cancelar(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.estado = 'detenida';
    this.liberar();
  }

  private liberar(): void {
    [this.pantalla, this.camara, this.micro].forEach(detenerStream);
    if (this.audioCtx.state !== 'closed') void this.audioCtx.close();
  }
}

// ── Miniaturas y metadatos ────────────────────────────────────────────────────

function fotogramaAJpeg(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width  = 640;
  canvas.height = Math.round(640 * (video.videoHeight / video.videoWidth));
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.8));
}

/** Toma un fotograma de una pista en vivo (la miniatura de una grabación). */
export async function capturarFotograma(track: MediaStreamTrack): Promise<Blob | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  try {
    await video.play();
    await new Promise(r => setTimeout(r, 700));
    return await fotogramaAJpeg(video);
  } finally {
    video.srcObject = null;
  }
}

export interface MetadatosVideo {
  duracionMs: number;
  ancho: number | null;
  alto: number | null;
  miniatura: Blob | null;
}

/**
 * Lee duración, resolución y una miniatura de un archivo de video. Los WebM de
 * MediaRecorder no traen duración en la cabecera: un salto al final obliga al
 * navegador a calcularla.
 */
export function leerMetadatos(blob: Blob): Promise<MetadatosVideo> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let duracion = 0;
    let terminado = false;

    const terminar = async (conFotograma: boolean) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      const miniatura = conFotograma ? await fotogramaAJpeg(video).catch(() => null) : null;
      const res: MetadatosVideo = {
        duracionMs: Number.isFinite(duracion) ? Math.round(duracion * 1000) : 0,
        ancho: video.videoWidth || null,
        alto:  video.videoHeight || null,
        miniatura,
      };
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(res);
    };
    const reloj = setTimeout(() => void terminar(false), 8000);

    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    // La miniatura sale de medio segundo (o del primer décimo si es más corto).
    const objetivo = () => Math.min(0.5, (duracion || 1) / 10);

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        duracion = video.duration;
        video.currentTime = objetivo();
      } else {
        // WebM sin duración: se busca el final y, al saberla, se vuelve atrás.
        video.currentTime = 1e101;
      }
    };
    video.onseeked = () => {
      if (!Number.isFinite(video.duration)) return;
      duracion = video.duration;
      if (video.currentTime > objetivo() + 0.25) { video.currentTime = objetivo(); return; }
      void terminar(true);
    };
    video.onerror = () => void terminar(false);
    video.src = url;
  });
}

// ── Formato ───────────────────────────────────────────────────────────────────

export function formatoDuracion(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatoTamano(bytes: number): string {
  if (!bytes) return '0 KB';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(unidades.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  // «50 MB», no «50.0 MB»: el decimal sólo aparece cuando aporta algo.
  const valor = (bytes / 1024 ** i).toFixed(i > 1 ? 1 : 0).replace(/\.0$/, '');
  return `${valor} ${unidades[i]}`;
}

/** «hace 3 días», «ayer», «hace un momento», en el idioma pedido. */
export function formatoRelativo(fecha: string | number, idioma: string): string {
  const s = (new Date(fecha).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(idioma, { numeric: 'auto' });
  const unidades: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
    ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unidad, tam] of unidades) {
    if (Math.abs(s) >= tam) return rtf.format(Math.round(s / tam), unidad);
  }
  return rtf.format(0, 'second');
}

/** «webm» / «mp4» / «mov» a partir del tipo MIME (sin parámetros de códec). */
export function extensionDeMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'video/mp4') return 'mp4';
  if (base === 'video/quicktime') return 'mov';
  return 'webm';
}

export function nombreDescarga(titulo: string, mime: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${base || 'video'}.${extensionDeMime(mime)}`;
}
