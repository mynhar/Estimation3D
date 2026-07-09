import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';

export interface FichaNormativa {
  id:             number;
  codigo:         string;
  titulo_fr:      string;
  titulo_en:      string;
  titulo_es:      string;
  resumen_fr:     string;
  resumen_en:     string;
  resumen_es:     string;
  palabras_clave: string[];
  activo:         boolean;
  orden:          number;
  creado_en:      string;
}

/** Campos escribibles (sin id / creado_en autogenerados). */
export type FichaNormativaInput = Omit<FichaNormativa, 'id' | 'creado_en'>;

/** Acceso a datos de `ficha_normativa` (referencia normativa de Quebec, admin). */
@Injectable({ providedIn: 'root' })
export class FichaNormativaRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  /** Todas las fichas (activas e inactivas), ordenadas por `orden`. */
  async findAll(): Promise<FichaNormativa[]> {
    const { data, error } = await this.db
      .from('ficha_normativa')
      .select('*')
      .order('orden', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as FichaNormativa[];
  }

  async findById(id: number): Promise<FichaNormativa | null> {
    const { data, error } = await this.db
      .from('ficha_normativa')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data as FichaNormativa;
  }

  async crear(input: FichaNormativaInput): Promise<FichaNormativa> {
    const { data, error } = await this.db
      .from('ficha_normativa')
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as FichaNormativa;
  }

  async actualizar(id: number, cambios: Partial<FichaNormativaInput>): Promise<FichaNormativa> {
    const { data, error } = await this.db
      .from('ficha_normativa')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as FichaNormativa;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.db
      .from('ficha_normativa')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
