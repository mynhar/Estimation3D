import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export interface ImprevistoCatalogo {
  id:                  number;
  servicio_id:         number | null;
  codigo:              string;
  titulo_fr:           string;
  titulo_en:           string;
  titulo_es:           string;
  perfil_fr:           string;
  perfil_en:           string;
  perfil_es:           string;
  protocolo_fr:        string;
  protocolo_en:        string;
  protocolo_es:        string;
  requiere_aprobacion: boolean;
  ficha_codigo:        string | null;
  activo:              boolean;
  orden:               number;
  creado_en:           string;
}

/** Campos escribibles (sin id / creado_en autogenerados). */
export type ImprevistoCatalogoInput = Omit<ImprevistoCatalogo, 'id' | 'creado_en'>;

/** Acceso a datos de `imprevisto_catalogo` (imprevistos por servicio, admin). */
@Injectable({ providedIn: 'root' })
export class ImprevistoCatalogoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Todos los imprevistos (activos e inactivos), ordenados por servicio y orden. */
  async findAll(): Promise<ImprevistoCatalogo[]> {
    const { data, error } = await this.db
      .from('imprevisto_catalogo')
      .select('*')
      .order('servicio_id', { ascending: true, nullsFirst: true })
      .order('orden', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ImprevistoCatalogo[];
  }

  async findById(id: number): Promise<ImprevistoCatalogo | null> {
    const { data, error } = await this.db
      .from('imprevisto_catalogo')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data as ImprevistoCatalogo;
  }

  async crear(input: ImprevistoCatalogoInput): Promise<ImprevistoCatalogo> {
    const { data, error } = await this.db
      .from('imprevisto_catalogo')
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ImprevistoCatalogo;
  }

  async actualizar(id: number, cambios: Partial<ImprevistoCatalogoInput>): Promise<ImprevistoCatalogo> {
    const { data, error } = await this.db
      .from('imprevisto_catalogo')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ImprevistoCatalogo;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.db
      .from('imprevisto_catalogo')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
