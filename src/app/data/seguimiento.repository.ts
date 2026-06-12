import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import {
  ActividadServicio,
  FaseServicio,
  Inspeccion,
  InspeccionInput,
  ReporteDiario,
  SeguimientoObra,
  StatsReportes,
} from '../models/seguimiento.model';

export interface ReporteInput {
  seguimiento_id:        string;
  constructor_id:        string;
  fecha:                 string;
  hora_inicio:           string;
  horas_trabajadas:      number;
  porcentaje_avance_dia: number;
  porcentaje_acumulado:  number;
  fase_id?:              string;
  descripcion?:          string | null;
}

export interface ReporteActividad {
  id:           string;
  reporte_id:   string;
  actividad_id: string;
}

export interface ReporteZona {
  id:                string;
  reporte_id:        string;
  zona:              string;
  descripcion:       string | null;
  porcentaje_avance: number | null;
}

@Injectable({ providedIn: 'root' })
export class SeguimientoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  // ── Seguimiento cabecera ──────────────────────────────────────────────────

  async findByContratoId(contratoId: string): Promise<SeguimientoObra | null> {
    const { data, error } = await this.db
      .from('seguimiento_obra')
      .select('*, expediente:expediente_id(servicio_id)')
      .eq('contrato_id', contratoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const exp = Array.isArray(data.expediente) ? data.expediente[0] : data.expediente;
    const { expediente: _, ...rest } = data as any;
    return { ...rest, servicio_id: exp?.servicio_id ?? null } as SeguimientoObra;
  }

  async ensureForContrato(contratoId: string, expedienteId: string, constructorId: string): Promise<SeguimientoObra> {
    const existing = await this.findByContratoId(contratoId);
    if (existing) return existing;
    const { data, error } = await this.db
      .from('seguimiento_obra')
      .insert({ contrato_id: contratoId, expediente_id: expedienteId, constructor_id: constructorId })
      .select('*, expediente:expediente_id(servicio_id)')
      .single();
    if (error) throw new Error(error.message);
    const exp = Array.isArray(data.expediente) ? data.expediente[0] : data.expediente;
    const { expediente: _, ...rest } = data as any;
    return { ...rest, servicio_id: exp?.servicio_id ?? null } as SeguimientoObra;
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────

  async findFasesByServicioId(servicioId: number): Promise<FaseServicio[]> {
    const { data, error } = await this.db
      .from('fase_servicio')
      .select('*')
      .eq('servicio_id', servicioId)
      .eq('activo', true)
      .order('orden');
    if (error) throw new Error(error.message);
    return (data ?? []) as FaseServicio[];
  }

  async findActividadesByServicioId(servicioId: number): Promise<ActividadServicio[]> {
    const { data, error } = await this.db
      .from('actividad_servicio')
      .select('*')
      .eq('servicio_id', servicioId)
      .eq('activo', true);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActividadServicio[];
  }

  // ── Reportes diarios ──────────────────────────────────────────────────────

  async findReporteByFecha(seguimientoId: string, fecha: string): Promise<ReporteDiario | null> {
    const { data, error } = await this.db
      .from('reporte_diario')
      .select('*')
      .eq('seguimiento_id', seguimientoId)
      .eq('fecha', fecha)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as ReporteDiario | null;
  }

  async findReportesRecientes(seguimientoId: string, limit = 5): Promise<ReporteDiario[]> {
    const { data, error } = await this.db
      .from('reporte_diario')
      .select('*')
      .eq('seguimiento_id', seguimientoId)
      .order('fecha', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReporteDiario[];
  }

  async findFechasTrabajadasMes(seguimientoId: string, year: number, month: number): Promise<string[]> {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const { data, error } = await this.db
      .from('reporte_diario')
      .select('fecha')
      .eq('seguimiento_id', seguimientoId)
      .gte('fecha', from)
      .lte('fecha', to);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => r.fecha as string);
  }

  async findStats(seguimientoId: string): Promise<StatsReportes> {
    const { data, error } = await this.db
      .from('reporte_diario')
      .select('horas_trabajadas')
      .eq('seguimiento_id', seguimientoId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { horas_trabajadas: number }[];
    return {
      total_dias:  rows.length,
      total_horas: rows.reduce((sum, r) => sum + (r.horas_trabajadas ?? 0), 0),
    };
  }

  async upsertReporte(input: ReporteInput): Promise<ReporteDiario> {
    const { data, error } = await this.db
      .from('reporte_diario')
      .upsert(
        {
          seguimiento_id:        input.seguimiento_id,
          constructor_id:        input.constructor_id,
          fecha:                 input.fecha,
          hora_inicio:           input.hora_inicio,
          horas_trabajadas:      input.horas_trabajadas,
          porcentaje_avance_dia: input.porcentaje_avance_dia,
          porcentaje_acumulado:  input.porcentaje_acumulado,
          fase_id:               input.fase_id ?? null,
          descripcion:           input.descripcion ?? null,
        },
        { onConflict: 'seguimiento_id,fecha' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReporteDiario;
  }

  // ── Actividades del reporte ───────────────────────────────────────────────

  async findActividadesReporte(reporteId: string): Promise<ReporteActividad[]> {
    const { data, error } = await this.db
      .from('reporte_actividad')
      .select('*')
      .eq('reporte_id', reporteId);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReporteActividad[];
  }

  async setActividadesReporte(reporteId: string, actividadIds: string[]): Promise<void> {
    const { error: delErr } = await this.db
      .from('reporte_actividad')
      .delete()
      .eq('reporte_id', reporteId);
    if (delErr) throw new Error(delErr.message);
    if (!actividadIds.length) return;
    const rows = actividadIds.map(aid => ({ reporte_id: reporteId, actividad_id: aid }));
    const { error: insErr } = await this.db.from('reporte_actividad').insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  // Cuenta, por actividad, en cuántos reportes del seguimiento se realizó.
  // Sirve para mostrar el avance porcentual por actividad (días / total días).
  async findActividadesAgregadas(seguimientoId: string): Promise<{ actividad_id: string; dias: number }[]> {
    const { data, error } = await this.db
      .from('reporte_actividad')
      .select('actividad_id, reporte_diario!inner(seguimiento_id)')
      .eq('reporte_diario.seguimiento_id', seguimientoId);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { actividad_id: string }[]) {
      counts.set(row.actividad_id, (counts.get(row.actividad_id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([actividad_id, dias]) => ({ actividad_id, dias }));
  }

  // ── Zonas del reporte ─────────────────────────────────────────────────────

  async findZonasReporte(reporteId: string): Promise<ReporteZona[]> {
    const { data, error } = await this.db
      .from('reporte_zona')
      .select('*')
      .eq('reporte_id', reporteId);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReporteZona[];
  }

  async upsertZona(reporteId: string, zona: string, descripcion: string | null, pct: number | null): Promise<void> {
    await this.db.from('reporte_zona').delete().eq('reporte_id', reporteId).eq('zona', zona);
    const { error } = await this.db.from('reporte_zona').insert({
      reporte_id: reporteId,
      zona,
      descripcion,
      porcentaje_avance: pct,
    });
    if (error) throw new Error(error.message);
  }

  // ── Inspecciones ──────────────────────────────────────────────────────────

  async findProximasInspecciones(seguimientoId: string, limit = 3): Promise<Inspeccion[]> {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await this.db
      .from('inspeccion')
      .select('*')
      .eq('seguimiento_id', seguimientoId)
      .eq('estado', 'programada')
      .gte('fecha', hoy)
      .order('fecha')
      .order('hora')
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as Inspeccion[];
  }

  async deleteReporte(id: string): Promise<void> {
    const { error } = await this.db.from('reporte_diario').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async recalcularAvanceSeguimiento(seguimientoId: string): Promise<void> {
    const { error } = await (this.db.rpc as any)(
      'recalcular_avance_seguimiento', { p_seguimiento_id: seguimientoId },
    );
    if (error) throw new Error(error.message);
  }

  async findInspeccionesMes(seguimientoId: string, year: number, month: number): Promise<Inspeccion[]> {
    const from    = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to      = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const { data, error } = await this.db
      .from('inspeccion')
      .select('*')
      .eq('seguimiento_id', seguimientoId)
      .eq('estado', 'programada')
      .gte('fecha', from)
      .lte('fecha', to)
      .order('fecha');
    if (error) throw new Error(error.message);
    return (data ?? []) as Inspeccion[];
  }

  async deleteInspeccion(id: string): Promise<void> {
    const { error } = await this.db.from('inspeccion').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async insertInspeccion(input: InspeccionInput): Promise<Inspeccion> {
    const { data, error } = await this.db
      .from('inspeccion')
      .insert({
        seguimiento_id: input.seguimiento_id,
        tipo_visitante: input.tipo_visitante,
        fecha:          input.fecha,
        hora:           input.hora,
        motivo:         input.motivo,
        creado_por:     input.creado_por,
        estado:         'programada',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Inspeccion;
  }
}
