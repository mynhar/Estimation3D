import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { TipoInmueble } from '../types/supabase';

export type LocRaw = {
  expediente_id: string;
  direccion:  string;
  referencia: string | null;
  provincia:  string;
  canton:     string;
  distrito:   string | null;
};

export type LocFull = LocRaw & {
  tipo_inmueble: TipoInmueble;
  latitud:  number | null;
  longitud: number | null;
};

@Injectable({ providedIn: 'root' })
export class LocalizacionRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findByExpedienteId(expedienteId: string): Promise<LocRaw | null> {
    const { data, error } = await this.db
      .from('localizacion')
      .select('expediente_id, direccion, referencia, provincia, canton, distrito')
      .eq('expediente_id', expedienteId)
      .single();
    if (error) throw new Error(error.message);
    return data as LocRaw;
  }

  async findByExpedienteIds(ids: string[]): Promise<LocRaw[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from('localizacion')
      .select('expediente_id, direccion, referencia, provincia, canton, distrito')
      .in('expediente_id', ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as LocRaw[];
  }

  async findFullByExpedienteId(expedienteId: string): Promise<LocFull | null> {
    const { data, error } = await this.db
      .from('localizacion')
      .select('expediente_id, tipo_inmueble, direccion, provincia, canton, distrito, referencia, latitud, longitud')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as LocFull | null;
  }

  async insert(data: Omit<LocFull, 'expediente_id'> & { expediente_id: string }): Promise<void> {
    const { error } = await (this.db.from('localizacion') as any).insert(data);
    if (error) throw new Error(error.message);
  }

  async update(expedienteId: string, data: Partial<LocFull>): Promise<void> {
    const { error } = await (this.db.from('localizacion') as any)
      .update(data)
      .eq('expediente_id', expedienteId);
    if (error) throw new Error(error.message);
  }
}
