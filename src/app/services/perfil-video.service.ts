import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { DbPerfilVideo } from '../types/supabase';
import {
  ModoGrabacion, TAMANO_MAX_BYTES, extensionDeMime,
} from '../shared/ui/presentacion-videos/grabacion';

/** Bucket privado: los videos se sirven con URL firmadas. */
const BUCKET = 'presentaciones';
/** Validez de las URL firmadas (miniaturas y reproducción). */
const URL_SEGUNDOS = 60 * 60;

export interface NuevoVideoPresentacion {
  perfilId:   string;
  titulo:     string;
  archivo:    Blob;
  miniatura:  Blob | null;
  duracionMs: number;
  ancho:      number | null;
  alto:       number | null;
  origen:     'grabacion' | 'subida';
  modo:       ModoGrabacion | null;
}

/** Código traducible bajo `presentation_videos.errors.*`. */
export class VideoError extends Error {
  constructor(readonly code: 'muy_grande' | 'formato' | 'vacio' | 'subida' | 'guardado') {
    super(code);
    this.name = 'VideoError';
  }
}

/**
 * Videos de presentación de un estimador o constructor (`perfil_video` +
 * bucket `presentaciones`). Escribe sólo el administrador; lo garantiza RLS.
 */
@Injectable({ providedIn: 'root' })
export class PerfilVideoService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async listar(perfilId: string): Promise<DbPerfilVideo[]> {
    const { data, error } = await this.db
      .from('perfil_video')
      .select('*')
      .eq('perfil_id', perfilId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  /** URL firmadas de las miniaturas, por id de video. */
  async urlsMiniaturas(videos: DbPerfilVideo[]): Promise<Record<string, string>> {
    const conMiniatura = videos.filter(v => v.miniatura_path);
    if (!conMiniatura.length) return {};
    const { data, error } = await this.db.storage
      .from(BUCKET)
      .createSignedUrls(conMiniatura.map(v => v.miniatura_path!), URL_SEGUNDOS);
    if (error) throw error;
    const porRuta = new Map((data ?? []).map(d => [d.path, d.signedUrl]));
    const res: Record<string, string> = {};
    for (const v of conMiniatura) {
      const url = porRuta.get(v.miniatura_path!);
      if (url) res[v.id] = url;
    }
    return res;
  }

  /** URL firmada del archivo. Con `descarga`, el navegador lo guarda con ese nombre. */
  async urlVideo(video: DbPerfilVideo, descarga?: string): Promise<string> {
    const { data, error } = await this.db.storage
      .from(BUCKET)
      .createSignedUrl(video.video_path, URL_SEGUNDOS, descarga ? { download: descarga } : undefined);
    if (error || !data) throw error ?? new Error('signed_url');
    return data.signedUrl;
  }

  /**
   * Sube el archivo y su miniatura y crea la fila. Si la fila falla, borra lo
   * subido: no quedan archivos huérfanos en el bucket.
   */
  async crear(n: NuevoVideoPresentacion): Promise<DbPerfilVideo> {
    if (!n.archivo.size) throw new VideoError('vacio');
    if (n.archivo.size > TAMANO_MAX_BYTES) throw new VideoError('muy_grande');

    // Sin parámetros de códec: el bucket filtra por `video/webm`, no por
    // `video/webm;codecs=vp9,opus`.
    const mime = (n.archivo.type || 'video/webm').split(';')[0].trim().toLowerCase();
    if (!['video/webm', 'video/mp4', 'video/quicktime'].includes(mime)) throw new VideoError('formato');

    const id = crypto.randomUUID();
    const videoPath = `${n.perfilId}/${id}.${extensionDeMime(mime)}`;
    const miniaturaPath = n.miniatura ? `${n.perfilId}/${id}.jpg` : null;
    const storage = this.db.storage.from(BUCKET);

    const subida = await storage.upload(videoPath, n.archivo, { contentType: mime, upsert: false });
    if (subida.error) throw new VideoError('subida');

    if (n.miniatura && miniaturaPath) {
      const mini = await storage.upload(miniaturaPath, n.miniatura, { contentType: 'image/jpeg', upsert: true });
      // Sin miniatura el video sigue sirviendo: la tarjeta muestra un icono.
      if (mini.error) console.warn('[PerfilVideo] miniatura:', mini.error.message);
    }

    const { data, error } = await this.db
      .from('perfil_video')
      .insert({
        id,
        perfil_id:      n.perfilId,
        titulo:         n.titulo.trim().slice(0, 120) || 'Video',
        video_path:     videoPath,
        miniatura_path: miniaturaPath,
        mime_type:      mime,
        tamano_bytes:   n.archivo.size,
        duracion_ms:    Math.max(0, Math.round(n.duracionMs)),
        ancho:          n.ancho || null,
        alto:           n.alto || null,
        origen:         n.origen,
        modo:           n.modo,
      })
      .select('*')
      .single();

    if (error || !data) {
      await storage.remove([videoPath, ...(miniaturaPath ? [miniaturaPath] : [])]).catch(() => undefined);
      console.error('[PerfilVideo] insert:', error?.message);
      throw new VideoError('guardado');
    }
    return data;
  }

  async renombrar(id: string, titulo: string): Promise<void> {
    const { error } = await this.db
      .from('perfil_video')
      .update({ titulo: titulo.trim().slice(0, 120) })
      .eq('id', id);
    if (error) throw error;
  }

  /** Borra la fila y después los archivos (si estos fallan, sólo queda basura en el bucket). */
  async eliminar(video: DbPerfilVideo): Promise<void> {
    const { error } = await this.db.from('perfil_video').delete().eq('id', video.id);
    if (error) throw error;
    const rutas = [video.video_path, ...(video.miniatura_path ? [video.miniatura_path] : [])];
    const { error: errStorage } = await this.db.storage.from(BUCKET).remove(rutas);
    if (errStorage) console.warn('[PerfilVideo] storage remove:', errStorage.message);
  }

  /** Suma una vista y devuelve el total (null si no se pudo). */
  async registrarVista(id: string): Promise<number | null> {
    const { data, error } = await this.db.rpc('registrar_vista_perfil_video', { p_video_id: id });
    if (error) { console.warn('[PerfilVideo] vista:', error.message); return null; }
    return typeof data === 'number' ? data : null;
  }
}
