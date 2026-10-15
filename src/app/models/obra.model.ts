import { ReporteArchivoRow } from '../services/archivo.service';
import { ReporteZona } from '../data/seguimiento.repository';
import {
  ActividadServicio,
  FaseServicio,
  ReporteDiario,
} from './seguimiento.model';
import { ServicioContrato } from './contrato.model';

export interface FaseAvance {
  fase: FaseServicio;
  pct:  number;
}

export interface ActividadAvance {
  actividad: ActividadServicio;
  dias:      number;
  pct:       number;
  hecha:     boolean;
}

/** Fases de un servicio del contrato, repartiendo el avance de ESE servicio. */
export interface FasesServicio {
  servicioId: number;
  /** Avance del servicio (0–100). */
  avance:     number;
  fases:      FaseAvance[];
}

/** Actividades de un servicio del contrato, sobre los días trabajados en ESE servicio. */
export interface ActividadesServicio {
  servicioId:  number;
  actividades: ActividadAvance[];
}

/**
 * Un parte de un día con su detalle. Hay uno por servicio trabajado ese día,
 * cada uno con sus zonas y sus archivos.
 */
export interface ParteDia {
  reporte:    ReporteDiario;
  zonas:      ReporteZona[];
  fotos:      ReporteArchivoRow[];
  videos:     ReporteArchivoRow[];
  documentos: ReporteArchivoRow[];
}

// Vista agregada de una obra (un contrato con seguimiento). Solo lectura.
// Compartida por las vistas de seguimiento de cliente y estimador.
export interface ObraVM {
  contratoId:          string;
  seguimientoId:       string;
  expedienteNumero:    string;
  servicioNombre:      string;
  servicioNombreEn:    string;
  servicioNombreFr:    string;
  /** Todos los servicios del contrato; vacío = solo el principal (`servicioNombre*`). */
  servicios:           ServicioContrato[];
  estadoContrato:      string;
  avanceGlobal:        number;
  ultimaActualizacion: string;
  plazoMin:            number | null;
  plazoMax:            number | null;
  // Secciones acumuladas. `fases` es del servicio principal (contratos de un
  // solo servicio); `fasesPorServicio`, una entrada por servicio del contrato.
  fases:               FaseAvance[];
  fasesPorServicio:    FasesServicio[];
  actividades:         ActividadAvance[];
  /** Una entrada por servicio del contrato (`actividades` es la del principal). */
  actividadesPorServicio: ActividadesServicio[];
  /** Fases de todos los servicios del contrato, solo para nombrar la fase de cada parte. */
  fasesCatalogo:       FaseServicio[];
  /** Partes de los últimos días trabajados; varios por día si se trabajaron varios servicios. */
  eventos:             ReporteDiario[];
  /** Detalle del día más reciente, ya cargado (punto de partida de la selección). */
  partesUltimoDia:     ParteDia[];
}
