import { Injectable, inject } from '@angular/core';
import { SeguimientoService } from './seguimiento.service';
import { ArchivoService, ReporteArchivoRow } from './archivo.service';
import { ReporteZona } from '../data/seguimiento.repository';
import { ActividadServicio, FaseServicio, ReporteDiario } from '../models/seguimiento.model';
import {
  ActividadAvance, ActividadesServicio, FaseAvance, FasesServicio, ObraVM, ParteDia, ServicioContrato,
} from '../models';

// Datos mínimos de contrato necesarios para construir el ObraVM. Lo cumplen
// tanto ContratoListItem (cliente) como ContratoConstructorListItem (estimador).
export interface ObraContratoInput {
  id:                 string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  /** Todos los servicios del contrato, si el que llama los tiene. */
  servicios?:         ServicioContrato[];
  estado:             string;
  plazo_semanas_min:  number | null;
  plazo_semanas_max:  number | null;
}

/**
 * Construye la vista agregada de una obra (ObraVM) a partir de un contrato.
 * Lógica compartida por las vistas de seguimiento de cliente y estimador.
 */
@Injectable({ providedIn: 'root' })
export class ObraVmService {
  private seguimientoService = inject(SeguimientoService);
  private archivoService     = inject(ArchivoService);

  /** Días que enseña el historial de la tarjeta (con todos los partes de cada uno). */
  private static readonly DIAS_EVENTOS = 6;

  async construirObra(c: ObraContratoInput): Promise<ObraVM | null> {
    const seg = await this.seguimientoService.getSeguimientoByContratoId(c.id);
    if (!seg) return null;

    // Fases y actividades de todos los servicios del contrato: los paneles se
    // agrupan por servicio y el historial nombra la fase de cada parte.
    const servicioIds = this.idsServicios(c, seg.servicio_id);

    const [fasesRaw, actividadesRaw, actsAgg, recientesRaw, stats] = await Promise.all([
      servicioIds.length
        ? this.seguimientoService.getFasesByServicioIds(servicioIds)
        : Promise.resolve([]),
      servicioIds.length
        ? this.seguimientoService.getActividadesByServicioIds(servicioIds)
        : Promise.resolve([]),
      this.seguimientoService.getActividadesAgregadas(seg.id),
      // De sobra para cubrir los últimos días aunque cada uno tenga varios partes.
      this.seguimientoService.getReportesRecientes(seg.id, ObraVmService.DIAS_EVENTOS * 5),
      this.seguimientoService.getStatsReportes(seg.id),
    ]);

    const eventos         = this.ultimosDias(recientesRaw);
    const partesUltimoDia = await this.cargarPartes(this.partesDelPrimerDia(eventos));
    const avanceGlobal    = c.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance);
    const fasesPrincipal  = fasesRaw.filter(f => f.servicio_id === seg.servicio_id);

    return {
      contratoId:          c.id,
      seguimientoId:       seg.id,
      expedienteNumero:    c.expediente_numero,
      servicioNombre:      c.servicio_nombre,
      servicioNombreEn:    c.servicio_nombre_en,
      servicioNombreFr:    c.servicio_nombre_fr,
      servicios:           c.servicios ?? [],
      estadoContrato:      c.estado,
      avanceGlobal,
      ultimaActualizacion: seg.actualizado_en,
      plazoMin:            c.plazo_semanas_min,
      plazoMax:            c.plazo_semanas_max,
      fases:               this.calcularFases(fasesPrincipal, avanceGlobal),
      fasesPorServicio:    this.fasesDeServicios(
        servicioIds, fasesRaw, stats.avance_por_servicio, c.estado === 'completado',
      ),
      actividades:         this.calcularActividades(
        actividadesRaw.filter(a => a.servicio_id === seg.servicio_id), actsAgg, stats.total_dias,
      ),
      actividadesPorServicio: this.actividadesDeServicios(
        servicioIds, actividadesRaw, actsAgg, stats.dias_por_servicio,
      ),
      fasesCatalogo:       fasesRaw,
      eventos,
      partesUltimoDia,
    };
  }

  /**
   * Versión en lote de construirObra para la vista de lista del cliente.
   * Reemplaza el patrón N+1 (1 + ~9·N consultas, todas en paralelo) por un
   * número fijo de consultas en conjunto (IN), evitando la ráfaga que provocaba
   * el `statement timeout`. Las obras sin seguimiento se omiten del resultado.
   */
  async construirObras(contratos: ObraContratoInput[]): Promise<ObraVM[]> {
    if (!contratos.length) return [];

    const seguimientos = await this.seguimientoService.getSeguimientosByContratoIds(
      contratos.map(c => c.id),
    );
    if (!seguimientos.length) return [];

    const segByContrato  = new Map(seguimientos.map(s => [s.contrato_id, s]));
    const seguimientoIds = seguimientos.map(s => s.id);
    // Fases y actividades de todos los servicios de los contratos: los paneles
    // se agrupan por servicio y el historial nombra la fase de cada parte.
    const servicioIds = [...new Set(
      contratos.flatMap(c => this.idsServicios(c, segByContrato.get(c.id)?.servicio_id ?? null)),
    )];

    const [fasesRaw, actividadesRaw, reportesRaw, aggRaw] = await Promise.all([
      this.seguimientoService.getFasesByServicioIds(servicioIds),
      this.seguimientoService.getActividadesByServicioIds(servicioIds),
      this.seguimientoService.getReportesBySeguimientoIds(seguimientoIds),
      this.seguimientoService.getActividadesAgregadasBySeguimientoIds(seguimientoIds),
    ]);

    const fasesPorServicio = this.agruparPor(fasesRaw,       f => f.servicio_id);
    const actsPorServicio  = this.agruparPor(actividadesRaw, a => a.servicio_id);
    const reportesPorSeg   = this.agruparPor(reportesRaw,    r => r.seguimiento_id);

    const aggPorSeg = new Map<string, { actividad_id: string; dias: number }[]>();
    for (const row of aggRaw) {
      const arr = aggPorSeg.get(row.seguimiento_id) ?? [];
      arr.push({ actividad_id: row.actividad_id, dias: row.dias });
      aggPorSeg.set(row.seguimiento_id, arr);
    }

    // Últimos días de cada obra y, de ellos, todos los partes del más reciente.
    const eventosPorSeg = new Map<string, ReporteDiario[]>();
    const ultimosPorSeg = new Map<string, ReporteDiario[]>();
    for (const seg of seguimientos) {
      const eventos = this.ultimosDias(reportesPorSeg.get(seg.id) ?? []);
      eventosPorSeg.set(seg.id, eventos);
      ultimosPorSeg.set(seg.id, this.partesDelPrimerDia(eventos));
    }

    const ultimoIds = [...ultimosPorSeg.values()].flat().map(r => r.id);
    const [zonasRaw, mediaPorReporte] = await Promise.all([
      this.seguimientoService.getZonasByReporteIds(ultimoIds),
      this.archivoService.cargarPorReportes(ultimoIds),
    ]);
    const zonasPorReporte = this.agruparPor(zonasRaw, z => z.reporte_id);

    const obras: ObraVM[] = [];
    for (const c of contratos) {
      const seg = segByContrato.get(c.id);
      if (!seg) continue; // sin seguimiento → no se muestra (igual que construirObra → null)

      const reportes     = reportesPorSeg.get(seg.id) ?? [];
      // Días, no partes: un día con dos servicios trabajados tiene dos partes.
      const totalDias    = new Set(reportes.map(r => this.soloFecha(r.fecha))).size;
      const avanceGlobal = c.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance);
      const svcId        = seg.servicio_id ?? -1;
      const idsServicios = this.idsServicios(c, seg.servicio_id);
      const idsObra      = new Set(idsServicios);

      obras.push({
        contratoId:          c.id,
        seguimientoId:       seg.id,
        expedienteNumero:    c.expediente_numero,
        servicioNombre:      c.servicio_nombre,
        servicioNombreEn:    c.servicio_nombre_en,
        servicioNombreFr:    c.servicio_nombre_fr,
        servicios:           c.servicios ?? [],
        estadoContrato:      c.estado,
        avanceGlobal,
        ultimaActualizacion: seg.actualizado_en,
        plazoMin:            c.plazo_semanas_min,
        plazoMax:            c.plazo_semanas_max,
        fases:               this.calcularFases(fasesPorServicio.get(svcId) ?? [], avanceGlobal),
        fasesPorServicio:    this.fasesDeServicios(
          idsServicios, fasesRaw, this.avancePorServicio(reportes), c.estado === 'completado',
        ),
        actividades:         this.calcularActividades(actsPorServicio.get(svcId) ?? [], aggPorSeg.get(seg.id) ?? [], totalDias),
        actividadesPorServicio: this.actividadesDeServicios(
          idsServicios, actividadesRaw, aggPorSeg.get(seg.id) ?? [], this.diasPorServicio(reportes),
        ),
        fasesCatalogo:       fasesRaw.filter(f => idsObra.has(f.servicio_id)),
        eventos:             eventosPorSeg.get(seg.id) ?? [],
        partesUltimoDia:     this.armarPartes(ultimosPorSeg.get(seg.id) ?? [], zonasPorReporte, mediaPorReporte),
      });
    }
    return obras;
  }

  /**
   * Detalle de los partes de un día: zonas y archivos de cada uno, en el orden
   * en que se guardaron. Lo usa también la tarjeta al elegir otro día.
   */
  async cargarPartes(reportes: ReporteDiario[]): Promise<ParteDia[]> {
    if (!reportes.length) return [];
    const ids = reportes.map(r => r.id);
    const [zonasRaw, media] = await Promise.all([
      this.seguimientoService.getZonasByReporteIds(ids),
      this.archivoService.cargarPorReportes(ids),
    ]);
    return this.armarPartes(reportes, this.agruparPor(zonasRaw, z => z.reporte_id), media);
  }

  private armarPartes(
    reportes:        ReporteDiario[],
    zonasPorReporte: Map<string, ReporteZona[]>,
    media:           Map<string, { fotos: ReporteArchivoRow[]; videos: ReporteArchivoRow[]; documentos: ReporteArchivoRow[] }>,
  ): ParteDia[] {
    return [...reportes]
      .sort((a, b) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''))
      .map(r => {
        const m = media.get(r.id);
        return {
          reporte:    r,
          zonas:      zonasPorReporte.get(r.id) ?? [],
          fotos:      m?.fotos      ?? [],
          videos:     m?.videos     ?? [],
          documentos: m?.documentos ?? [],
        };
      });
  }

  /**
   * Fases de cada servicio del contrato, repartiendo el avance de ESE servicio
   * (no el global). Con el contrato completado, todos al 100 %.
   */
  private fasesDeServicios(
    servicioIds:       number[],
    fasesRaw:          FaseServicio[],
    avancePorServicio: Record<number, number>,
    completado:        boolean,
  ): FasesServicio[] {
    return servicioIds.map(servicioId => {
      const avance = completado ? 100 : Math.round(Math.min(100, avancePorServicio[servicioId] ?? 0));
      return {
        servicioId,
        avance,
        fases: this.calcularFases(fasesRaw.filter(f => f.servicio_id === servicioId), avance),
      };
    });
  }

  /**
   * Actividades de cada servicio del contrato. El % de cada una es sobre los
   * días trabajados en SU servicio, no sobre todos los días de la obra.
   */
  private actividadesDeServicios(
    servicioIds:     number[],
    actividadesRaw:  ActividadServicio[],
    agg:             { actividad_id: string; dias: number }[],
    diasPorServicio: Record<number, number>,
  ): ActividadesServicio[] {
    return servicioIds.map(servicioId => ({
      servicioId,
      actividades: this.calcularActividades(
        actividadesRaw.filter(a => a.servicio_id === servicioId), agg, diasPorServicio[servicioId] ?? 0,
      ),
    }));
  }

  /** Días trabajados en cada servicio: un parte por servicio y día. */
  private diasPorServicio(reportes: ReporteDiario[]): Record<number, number> {
    const dias: Record<number, number> = {};
    for (const r of reportes) {
      if (r.servicio_id == null) continue;
      dias[r.servicio_id] = (dias[r.servicio_id] ?? 0) + 1;
    }
    return dias;
  }

  /** Avance de cada servicio a partir de sus partes (cada uno hasta el 100 %). */
  private avancePorServicio(reportes: ReporteDiario[]): Record<number, number> {
    const avance: Record<number, number> = {};
    for (const r of reportes) {
      if (r.servicio_id == null) continue;
      avance[r.servicio_id] = Math.min(100, (avance[r.servicio_id] ?? 0) + Number(r.porcentaje_avance_dia ?? 0));
    }
    return avance;
  }

  /** Servicios de la obra: los del contrato y, si no vienen, el principal. */
  private idsServicios(c: ObraContratoInput, principal: number | null): number[] {
    const ids = (c.servicios ?? []).map(s => s.id).filter(id => id > 0);
    if (principal != null && !ids.includes(principal)) ids.push(principal);
    return ids;
  }

  /**
   * Partes de los últimos días trabajados —todos los de cada día—, del más
   * reciente al más antiguo. `reportes` viene ordenado por fecha descendente.
   */
  private ultimosDias(reportes: ReporteDiario[], n = ObraVmService.DIAS_EVENTOS): ReporteDiario[] {
    const dias = new Set([...new Set(reportes.map(r => this.soloFecha(r.fecha)))].slice(0, n));
    return reportes.filter(r => dias.has(this.soloFecha(r.fecha)));
  }

  /** Los partes del día más reciente de la lista. */
  private partesDelPrimerDia(eventos: ReporteDiario[]): ReporteDiario[] {
    if (!eventos.length) return [];
    const dia = this.soloFecha(eventos[0].fecha);
    return eventos.filter(r => this.soloFecha(r.fecha) === dia);
  }

  private agruparPor<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const it of items) {
      const k   = key(it);
      const arr = map.get(k);
      if (arr) arr.push(it);
      else map.set(k, [it]);
    }
    return map;
  }

  private soloFecha(valor: string): string {
    return valor.includes('T') ? valor.split('T')[0] : valor;
  }

  // Avance por fase: reparte un avance (el del servicio, o el global con un
  // solo servicio) entre las fases ordenadas. Cada fase ocupa un segmento
  // igual; su % es la porción del avance que cae dentro de su segmento.
  private calcularFases(fases: FaseServicio[], avanceGlobal: number): FaseAvance[] {
    const n = fases.length;
    if (n === 0) return [];
    const seg = 100 / n;
    return fases
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((fase, i) => {
        const lower = i * seg;
        const pct   = Math.max(0, Math.min(100, ((avanceGlobal - lower) / seg) * 100));
        return { fase, pct: Math.round(pct) };
      });
  }

  // Avance por actividad: porcentaje de días trabajados en que se realizó.
  private calcularActividades(
    actividades: ActividadServicio[],
    agg:         { actividad_id: string; dias: number }[],
    totalDias:   number,
  ): ActividadAvance[] {
    const mapa = new Map(agg.map(a => [a.actividad_id, a.dias]));
    return actividades.map(actividad => {
      const dias = mapa.get(actividad.id) ?? 0;
      const pct  = totalDias > 0 ? Math.round((dias / totalDias) * 100) : 0;
      return { actividad, dias, pct, hecha: dias > 0 };
    });
  }
}
