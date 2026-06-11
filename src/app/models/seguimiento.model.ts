export interface FaseServicio {
  id:             string;
  servicio_id:    number;
  codigo:         string;
  orden:          number;
  nombre_fr:      string;
  nombre_en:      string;
  nombre_es:      string;
  descripcion_fr: string | null;
  descripcion_en: string | null;
  descripcion_es: string | null;
  activo:         boolean;
}

export interface ActividadServicio {
  id:          string;
  servicio_id: number;
  fase_id:     string | null;
  codigo:      string;
  nombre_fr:   string;
  nombre_en:   string;
  nombre_es:   string;
  activo:      boolean;
}

export interface SeguimientoObra {
  id:                string;
  contrato_id:       string;
  expediente_id:     string;
  constructor_id:    string;
  estado:            'no_iniciado' | 'en_progreso' | 'pausado' | 'completado';
  fecha_inicio_real: string | null;
  fecha_fin_real:    string | null;
  porcentaje_avance: number;
  fase_actual_id:    string | null;
  creado_en:         string;
  actualizado_en:    string;
  servicio_id:       number | null;
}

export interface ReporteDiario {
  id:                    string;
  seguimiento_id:        string;
  constructor_id:        string;
  fecha:                 string;
  hora_inicio:           string;
  hora_fin:              string | null;
  horas_trabajadas:      number;
  porcentaje_avance_dia: number;
  porcentaje_acumulado:  number | null;
  fase_id:               string | null;
  descripcion:           string | null;
  creado_en:             string;
  actualizado_en:        string;
}

export interface Inspeccion {
  id:             string;
  seguimiento_id: string;
  tipo_visitante: 'inspector' | 'dueno';
  fecha:          string;
  hora:           string;
  motivo:         string | null;
  estado:         'programada' | 'realizada' | 'cancelada';
  creado_por:     string;
  creado_en:      string;
  actualizado_en: string;
}

export interface InspeccionInput {
  seguimiento_id: string;
  tipo_visitante: 'inspector' | 'dueno';
  fecha:          string;
  hora:           string;
  motivo:         string | null;
  creado_por:     string;
}

export interface StatsReportes {
  total_dias:  number;
  total_horas: number;
}
