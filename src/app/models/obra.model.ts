import { ReporteArchivoRow } from '../services/archivo.service';
import { ReporteZona } from '../data/seguimiento.repository';
import {
  ActividadServicio,
  FaseServicio,
  ReporteDiario,
} from './seguimiento.model';

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

// Vista agregada de una obra (un contrato con seguimiento). Solo lectura.
// Compartida por las vistas de seguimiento de cliente y estimador.
export interface ObraVM {
  contratoId:          string;
  seguimientoId:       string;
  expedienteNumero:    string;
  servicioNombre:      string;
  servicioNombreEn:    string;
  servicioNombreFr:    string;
  estadoContrato:      string;
  avanceGlobal:        number;
  ultimaActualizacion: string;
  plazoMin:            number | null;
  plazoMax:            number | null;
  // Detalle del último parte (día más reciente; punto de partida de la selección)
  llegadaFecha:        string | null;
  llegadaHora:         string | null;
  horasDia:            number | null;
  // Secciones
  fases:               FaseAvance[];
  actividades:         ActividadAvance[];
  zonas:               ReporteZona[];
  eventos:             ReporteDiario[];
  reporteMediaFecha:   string | null;
  fotos:               ReporteArchivoRow[];
  videos:              ReporteArchivoRow[];
  documentos:          ReporteArchivoRow[];
}
