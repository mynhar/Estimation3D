import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { RolUsuario } from '../types/supabase';
import { AuthSupabaseService } from './auth-supabase.service';
import { EdgeError, edgeError } from './edge-error.service';

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

export interface CrearUsuarioParams extends DatosCompania {
  email:      string;
  password:   string;
  nombre:     string;
  apellido:   string;
  telefono:   string;
  avatar_url: string;
  rol:        RolUsuario;
  activo:     boolean;
}

export interface ActualizarUsuarioParams extends DatosCompania {
  nombre:     string;
  apellido:   string;
  telefono:   string;
  avatar_url: string;
  rol:        RolUsuario;
  activo:     boolean;
  email?:     string;
  password?:  string;
}

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private auth = inject(AuthSupabaseService);

  private async call(fn: string, body: unknown): Promise<void> {
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
  }

  crearUsuario(params: CrearUsuarioParams): Promise<void> {
    return this.call('crear-usuario', params);
  }

  actualizarUsuario(id: string, params: ActualizarUsuarioParams): Promise<void> {
    return this.call('actualizar-usuario', { id, ...params });
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
