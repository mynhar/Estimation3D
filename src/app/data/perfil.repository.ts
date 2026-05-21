import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { DbPerfil } from '../types/supabase';

export type PerfilNombre   = { id: string; nombre: string; apellido: string };
export type PerfilContacto = PerfilNombre & { telefono: string | null; email: string | null };

@Injectable({ providedIn: 'root' })
export class PerfilRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findById(id: string): Promise<{ nombre: string; apellido: string } | null> {
    const { data, error } = await this.db
      .from('perfil')
      .select('nombre, apellido')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findByIdWithContact(id: string): Promise<{ nombre: string; apellido: string; telefono: string | null } | null> {
    const { data, error } = await this.db
      .from('perfil')
      .select('nombre, apellido, telefono')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findByIds(ids: string[]): Promise<PerfilNombre[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilNombre[];
  }

  async findByIdsWithContact(ids: string[]): Promise<PerfilContacto[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido, telefono, email')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilContacto[];
  }

  async findAll(): Promise<DbPerfil[]> {
    const { data, error } = await this.db
      .from('perfil')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DbPerfil[];
  }
}
