import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { DbPerfil, ProveedorAuth, RolUsuario } from '../types/supabase';

export type PerfilNombre   = { id: string; nombre: string; apellido: string };
export type PerfilContacto = PerfilNombre & { telefono: string | null; email: string | null };
export type PerfilInvitable = PerfilContacto & { proveedor: ProveedorAuth };
export type PerfilNombreRol = PerfilNombre & { rol: RolUsuario };

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

  async findNombreRolByIds(ids: string[]): Promise<PerfilNombreRol[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido, rol')
      .in('id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilNombreRol[];
  }

  /**
   * Perfiles activos de los roles dados, con correo y proveedor de acceso.
   * El proveedor decide si a esa cuenta se le puede fijar una contraseña: la
   * que entra con Google no usa ninguna.
   */
  async findActivosByRolesInvitables(roles: RolUsuario[]): Promise<PerfilInvitable[]> {
    if (!roles.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido, telefono, email, proveedor')
      .in('rol', roles)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilInvitable[];
  }

  /** Perfiles activos de los roles dados, con teléfono y correo. */
  async findActivosByRolesWithContact(roles: RolUsuario[]): Promise<PerfilContacto[]> {
    if (!roles.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido, telefono, email')
      .in('rol', roles)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilContacto[];
  }

  async findByRoles(roles: RolUsuario[]): Promise<PerfilNombre[]> {
    if (!roles.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido')
      .in('rol', roles)
      .order('nombre', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilNombre[];
  }

  /** Perfiles activos de los roles dados (solo id y nombre). */
  async findActivosByRoles(roles: RolUsuario[]): Promise<PerfilNombre[]> {
    if (!roles.length) return [];
    const { data, error } = await this.db
      .from('perfil')
      .select('id, nombre, apellido')
      .in('rol', roles)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfilNombre[];
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
