import { Injectable, inject } from '@angular/core';
import {
  ActividadServicio,
  FaseServicio,
  Inspeccion,
  InspeccionInput,
  ReporteDiario,
  SeguimientoObra,
  StatsReportes,
} from '../models/seguimiento.model';
import {
  ReporteActividad,
  ReporteInput,
  ReporteZona,
  SeguimientoRepository,
} from '../data/seguimiento.repository';

@Injectable({ providedIn: 'root' })
export class SeguimientoService {
  private repo = inject(SeguimientoRepository);

  getSeguimientoByContratoId(contratoId: string): Promise<SeguimientoObra | null> {
    return this.repo.findByContratoId(contratoId);
  }

  ensureSeguimiento(contratoId: string, expedienteId: string, constructorId: string): Promise<SeguimientoObra> {
    return this.repo.ensureForContrato(contratoId, expedienteId, constructorId);
  }

  getFasesByServicioId(servicioId: number): Promise<FaseServicio[]> {
    return this.repo.findFasesByServicioId(servicioId);
  }

  getActividadesByServicioId(servicioId: number): Promise<ActividadServicio[]> {
    return this.repo.findActividadesByServicioId(servicioId);
  }

  getReporteByFecha(seguimientoId: string, fecha: string): Promise<ReporteDiario | null> {
    return this.repo.findReporteByFecha(seguimientoId, fecha);
  }

  getReportesRecientes(seguimientoId: string, limit = 5): Promise<ReporteDiario[]> {
    return this.repo.findReportesRecientes(seguimientoId, limit);
  }

  getFechasTrabajadasMes(seguimientoId: string, year: number, month: number): Promise<string[]> {
    return this.repo.findFechasTrabajadasMes(seguimientoId, year, month);
  }

  getStatsReportes(seguimientoId: string): Promise<StatsReportes> {
    return this.repo.findStats(seguimientoId);
  }

  upsertReporte(input: ReporteInput): Promise<ReporteDiario> {
    return this.repo.upsertReporte(input);
  }

  getActividadesReporte(reporteId: string): Promise<ReporteActividad[]> {
    return this.repo.findActividadesReporte(reporteId);
  }

  setActividadesReporte(reporteId: string, actividadIds: string[]): Promise<void> {
    return this.repo.setActividadesReporte(reporteId, actividadIds);
  }

  getZonasReporte(reporteId: string): Promise<ReporteZona[]> {
    return this.repo.findZonasReporte(reporteId);
  }

  upsertZona(reporteId: string, zona: string, descripcion: string | null, pct: number | null): Promise<void> {
    return this.repo.upsertZona(reporteId, zona, descripcion, pct);
  }

  getProximasInspecciones(seguimientoId: string, limit = 3): Promise<Inspeccion[]> {
    return this.repo.findProximasInspecciones(seguimientoId, limit);
  }

  deleteReporte(id: string): Promise<void> {
    return this.repo.deleteReporte(id);
  }

  recalcularAvanceSeguimiento(seguimientoId: string): Promise<void> {
    return this.repo.recalcularAvanceSeguimiento(seguimientoId);
  }

  getInspeccionesMes(seguimientoId: string, year: number, month: number): Promise<Inspeccion[]> {
    return this.repo.findInspeccionesMes(seguimientoId, year, month);
  }

  insertInspeccion(input: InspeccionInput): Promise<Inspeccion> {
    return this.repo.insertInspeccion(input);
  }

  deleteInspeccion(id: string): Promise<void> {
    return this.repo.deleteInspeccion(id);
  }
}
