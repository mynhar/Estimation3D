import { Injectable, inject } from '@angular/core';
import { SeguimientoService } from './seguimiento.service';
import { ArchivoService, ReporteArchivoRow } from './archivo.service';
import { ReporteZona } from '../data/seguimiento.repository';
import { ActividadServicio, FaseServicio, ReporteDiario } from '../models/seguimiento.model';
import { ActividadAvance, FaseAvance, ObraVM } from '../models';

// Datos mínimos de contrato necesarios para construir el ObraVM. Lo cumplen
// tanto ContratoListItem (cliente) como ContratoConstructorListItem (estimador).
export interface ObraContratoInput {
  id:                 string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
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

  async construirObra(c: ObraContratoInput): Promise<ObraVM | null> {
    const seg = await this.seguimientoService.getSeguimientoByContratoId(c.id);
    if (!seg) return null;

    const hoyISO = this.fechaISO(new Date());

    const [fasesRaw, actividadesRaw, actsAgg, recientes, reporteHoy, stats] =
      await Promise.all([
        seg.servicio_id != null ? this.seguimientoService.getFasesByServicioId(seg.servicio_id)      : Promise.resolve([]),
        seg.servicio_id != null ? this.seguimientoService.getActividadesByServicioId(seg.servicio_id) : Promise.resolve([]),
        this.seguimientoService.getActividadesAgregadas(seg.id),
        this.seguimientoService.getReportesRecientes(seg.id, 6),
        this.seguimientoService.getReporteByFecha(seg.id, hoyISO),
        this.seguimientoService.getStatsReportes(seg.id),
      ]);

    const ultimoReporte = reporteHoy ?? recientes[0] ?? null;

    let zonas: ReporteZona[]            = [];
    let fotos: ReporteArchivoRow[]      = [];
    let videos: ReporteArchivoRow[]     = [];
    let documentos: ReporteArchivoRow[] = [];
    if (ultimoReporte) {
      const [z, media] = await Promise.all([
        this.seguimientoService.getZonasReporte(ultimoReporte.id),
        this.archivoService.cargarPorReporte(ultimoReporte.id),
      ]);
      zonas      = z;
      fotos      = media.fotos;
      videos     = media.videos;
      documentos = media.documentos;
    }

    const avanceGlobal = c.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance);

    return {
      contratoId:          c.id,
      seguimientoId:       seg.id,
      expedienteNumero:    c.expediente_numero,
      servicioNombre:      c.servicio_nombre,
      servicioNombreEn:    c.servicio_nombre_en,
      servicioNombreFr:    c.servicio_nombre_fr,
      estadoContrato:      c.estado,
      avanceGlobal,
      ultimaActualizacion: seg.actualizado_en,
      plazoMin:            c.plazo_semanas_min,
      plazoMax:            c.plazo_semanas_max,
      llegadaFecha:        ultimoReporte?.fecha ?? null,
      llegadaHora:         ultimoReporte?.hora_inicio ?? null,
      horasDia:            ultimoReporte?.horas_trabajadas ?? null,
      fases:               this.calcularFases(fasesRaw, avanceGlobal),
      actividades:         this.calcularActividades(actividadesRaw, actsAgg, stats.total_dias),
      zonas,
      eventos:             recientes,
      reporteMediaFecha:   ultimoReporte?.fecha ?? null,
      fotos, videos, documentos,
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
    const servicioIds    = [...new Set(
      seguimientos.map(s => s.servicio_id).filter((id): id is number => id != null),
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

    const hoyISO = this.fechaISO(new Date());

    // Último parte por seguimiento: el de hoy si existe, si no el más reciente.
    const ultimoPorSeg = new Map<string, ReporteDiario | null>();
    for (const seg of seguimientos) {
      const reportes = reportesPorSeg.get(seg.id) ?? [];
      const hoy = reportes.find(r => this.soloFecha(r.fecha) === hoyISO);
      ultimoPorSeg.set(seg.id, hoy ?? reportes[0] ?? null);
    }

    const ultimoIds = [...ultimoPorSeg.values()]
      .filter((r): r is ReporteDiario => r !== null)
      .map(r => r.id);

    const [zonasRaw, mediaPorReporte] = await Promise.all([
      this.seguimientoService.getZonasByReporteIds(ultimoIds),
      this.archivoService.cargarPorReportes(ultimoIds),
    ]);
    const zonasPorReporte = this.agruparPor(zonasRaw, z => z.reporte_id);

    const obras: ObraVM[] = [];
    for (const c of contratos) {
      const seg = segByContrato.get(c.id);
      if (!seg) continue; // sin seguimiento → no se muestra (igual que construirObra → null)

      const reportes      = reportesPorSeg.get(seg.id) ?? [];
      const recientes     = reportes.slice(0, 6);
      const ultimoReporte = ultimoPorSeg.get(seg.id) ?? null;
      const totalDias     = reportes.length;
      const avanceGlobal  = c.estado === 'completado' ? 100 : Math.round(seg.porcentaje_avance);
      const media         = ultimoReporte ? mediaPorReporte.get(ultimoReporte.id) : undefined;
      const svcId         = seg.servicio_id ?? -1;

      obras.push({
        contratoId:          c.id,
        seguimientoId:       seg.id,
        expedienteNumero:    c.expediente_numero,
        servicioNombre:      c.servicio_nombre,
        servicioNombreEn:    c.servicio_nombre_en,
        servicioNombreFr:    c.servicio_nombre_fr,
        estadoContrato:      c.estado,
        avanceGlobal,
        ultimaActualizacion: seg.actualizado_en,
        plazoMin:            c.plazo_semanas_min,
        plazoMax:            c.plazo_semanas_max,
        llegadaFecha:        ultimoReporte?.fecha ?? null,
        llegadaHora:         ultimoReporte?.hora_inicio ?? null,
        horasDia:            ultimoReporte?.horas_trabajadas ?? null,
        fases:               this.calcularFases(fasesPorServicio.get(svcId) ?? [], avanceGlobal),
        actividades:         this.calcularActividades(actsPorServicio.get(svcId) ?? [], aggPorSeg.get(seg.id) ?? [], totalDias),
        zonas:               ultimoReporte ? (zonasPorReporte.get(ultimoReporte.id) ?? []) : [],
        eventos:             recientes,
        reporteMediaFecha:   ultimoReporte?.fecha ?? null,
        fotos:               media?.fotos      ?? [],
        videos:              media?.videos     ?? [],
        documentos:          media?.documentos ?? [],
      });
    }
    return obras;
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

  // Avance por fase: reparte el avance global entre las fases ordenadas.
  // Cada fase ocupa un segmento igual; su % es la porción del avance global
  // que cae dentro de su segmento.
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

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
