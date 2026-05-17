import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { RolUsuario } from '../types/supabase';
import { AuthSupabaseService } from './auth-supabase.service';

export interface CrearUsuarioParams {
  email:      string;
  password:   string;
  nombre:     string;
  apellido:   string;
  telefono:   string;
  avatar_url: string;
  rol:        RolUsuario;
  activo:     boolean;
}

export interface ActualizarUsuarioParams {
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

  private async token(): Promise<string> {
    const { data } = await this.auth.client.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error('Sesión no válida. Inicia sesión nuevamente.');
    return t;
  }

  private async call(fn: string, body: unknown): Promise<void> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/${fn}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await this.token()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(payload.error ?? `Error ${res.status}`);
    }
  }

  crearUsuario(params: CrearUsuarioParams): Promise<void> {
    return this.call('crear-usuario', params);
  }

  actualizarUsuario(id: string, params: ActualizarUsuarioParams): Promise<void> {
    return this.call('actualizar-usuario', { id, ...params });
  }

  async uploadAvatar(file: File, id?: string): Promise<string> {
    if (file.size > 2 * 1024 * 1024) throw new Error('El archivo no debe superar 2 MB.');

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
