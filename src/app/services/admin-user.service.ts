import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { RolUsuario } from '../types/supabase';
import { AuthSupabaseService } from './auth-supabase.service';
import { EdgeError, edgeError } from './edge-error.service';
import { Lang } from './lang.service';

/**
 * Datos de compañía del constructor. Opcionales, y sólo se conservan si el rol
 * es `constructor`: la edge function los ignora (y limpia) para el resto.
 */
export interface DatosCompania {
  compania_nombre?:    string;
  compania_telefono?:  string;
  compania_email?:     string;
  compania_direccion?: string;
}

/**
 * Datos profesionales del constructor. Igual que los de compañía, la edge
 * function los ignora (y limpia) para cualquier otro rol.
 */
export interface DatosConstructor {
  /** Licencia RBQ de Quebec, formato «0000-0000-00». */
  rbq?:               string;
  /**
   * Tipos de servicio que cubre: ids de la tabla `servicio`. Es la respuesta
   * completa, y vive en `perfil_especialidad`. Vacia cuando `especialidad_todas`.
   */
  especialidad_ids?:  number[];
  /**
   * Derivado de `especialidad_ids`: lo escribe la edge function con el unico id
   * elegido, o null si hay varios. Se conserva porque hay lecturas antiguas que
   * miran esta columna; no se envia desde el formulario.
   */
  especialidad_id?:   number | null;
  /** true = cubre todos los tipos de servicio. Excluyente con la lista. */
  especialidad_todas?: boolean;
  anios_experiencia?: number | null;
  zona_servicio?:     string;
  /** Nota libre sobre su enfoque, obras recientes o preguntas. */
  mensaje?:           string;
}

/**
 * Dirección personal del usuario (canadiense). Los cinco campos son opcionales
 * y se guardan tal cual para cualquier rol.
 */
export interface DatosDireccion {
  direccion_unidad?:        string;
  direccion_calle?:         string;
  direccion_ciudad?:        string;
  direccion_provincia?:     string;
  direccion_codigo_postal?: string;
}

export interface CrearUsuarioParams extends DatosCompania, DatosConstructor, DatosDireccion {
  email:      string;
  password:   string;
  nombre:     string;
  apellido:   string;
  telefono:   string;
  avatar_url: string;
  rol:        RolUsuario;
  activo:     boolean;
  /**
   * Idioma inicial del usuario: en el que se le escribirá hasta que él mismo
   * elija otro en la aplicación. Si se omite, la edge function pone 'fr'.
   */
  idioma?:    Lang;
}

export interface ActualizarUsuarioParams extends DatosCompania, DatosConstructor, DatosDireccion {
  nombre:     string;
  apellido:   string;
  telefono:   string;
  avatar_url: string;
  rol:        RolUsuario;
  activo:     boolean;
  email?:     string;
  password?:  string;
}

/** Resultado de `enviarCredenciales()`. */
export interface EnvioCredenciales {
  /** Dirección a la que se envió. */
  email:     string;
  /** Idioma en el que se redactó el correo, tomado de `perfil.idioma`. */
  idioma:    'fr' | 'en' | 'es';
  /** Remitente real: puede ser el de pruebas de Resend si el dominio no está verificado. */
  remitente: string;
}

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private auth = inject(AuthSupabaseService);

  private async post<T>(fn: string, body: unknown): Promise<T> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/${fn}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.auth.getAccessToken()}`,
      },
      body: JSON.stringify(body),
    });
    // Se propaga el código, no el texto: el mensaje de la función está solo en
    // español y lo traduce el componente con `EdgeErrorService`.
    if (!res.ok) throw await edgeError(res);
    return res.json().catch(() => ({} as T));
  }

  private async call(fn: string, body: unknown): Promise<void> {
    await this.post<unknown>(fn, body);
  }

  /** Devuelve el `id` del usuario recién creado, para poder invitarlo enseguida. */
  crearUsuario(params: CrearUsuarioParams): Promise<{ id: string }> {
    return this.post<{ id: string }>('crear-usuario', params);
  }

  actualizarUsuario(id: string, params: ActualizarUsuarioParams): Promise<void> {
    return this.call('actualizar-usuario', { id, ...params });
  }

  /**
   * Envía al usuario un correo con sus credenciales, redactado en su idioma
   * (`perfil.idioma`).
   *
   * OJO: la contraseña actual no se puede leer (está hasheada), así que esta
   * llamada **la reinicia** con la que se pase. `password` es obligatoria —
   * nunca se genera una temporal. Pedir confirmación antes de llamar.
   */
  enviarCredenciales(id: string, password: string): Promise<EnvioCredenciales> {
    return this.post<EnvioCredenciales>('enviar-credenciales', { id, password });
  }

  async uploadAvatar(file: File, id?: string): Promise<string> {
    if (file.size > 2 * 1024 * 1024) throw new EdgeError('archivo_muy_grande');

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const name = id ?? crypto.randomUUID();
    const path = `avatares/${name}.${ext}`;

    const { error } = await this.auth.client.storage
      .from('archivos')
      .upload(path, file, { contentType: file.type, upsert: true });

    if (error) throw new Error(error.message);

    return this.auth.client.storage.from('archivos').getPublicUrl(path).data.publicUrl;
  }
}
