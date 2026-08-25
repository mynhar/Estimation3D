/**
 * Ficha de la propiedad escaneada que devuelve la Model API de Matterport,
 * sincronizada por la edge function `matterport-sync` a partir de las URLs de
 * tour guardadas en `estimacion.url_tour`.
 */

/** Dimensiones métricas de un piso o de una habitación. */
export interface MatterportDimensiones {
  area_piso_m2:          number | null;
  area_piso_interior_m2: number | null;
  volumen_m3:            number | null;
  alto_m:                number | null;
  ancho_m:               number | null;
  profundidad_m:         number | null;
}

/** Un piso del modelo, en el orden vertical que reporta Matterport. */
export interface MatterportPiso extends MatterportDimensiones {
  id:        string;
  etiqueta:  string | null;
  /** Orden vertical: 0 es el piso más bajo. */
  secuencia: number | null;
}

/** Una habitación del modelo, con el piso al que pertenece. */
export interface MatterportHabitacion extends MatterportDimensiones {
  id:             string;
  etiqueta:       string | null;
  /** Clasificadores automáticos de Matterport (kitchen, bathroom, …). */
  tags:           string[];
  piso_id:        string | null;
  piso_etiqueta:  string | null;
  piso_secuencia: number | null;
}

/** Fila de `matterport_modelo`: un modelo de Matterport de un expediente. */
export interface MatterportModelo {
  id:            string;
  expediente_id: string;
  model_id:      string;
  url_tour:      string;

  nombre:      string | null;
  descripcion: string | null;
  estado:      string | null;
  visibilidad: string | null;

  direccion:     string | null;
  calle:         string | null;
  ciudad:        string | null;
  region:        string | null;
  codigo_postal: string | null;
  pais:          string | null;
  latitud:       number | null;
  longitud:      number | null;

  area_piso_m2:          number | null;
  area_piso_interior_m2: number | null;
  area_pared_m2:         number | null;
  area_techo_m2:         number | null;
  volumen_m3:            number | null;
  alto_m:                number | null;
  ancho_m:               number | null;
  profundidad_m:         number | null;

  area_piso_ft2:          number | null;
  area_piso_interior_ft2: number | null;

  total_pisos:        number | null;
  total_habitaciones: number | null;
  pisos:              MatterportPiso[];
  habitaciones:       MatterportHabitacion[];

  imagen_url:      string | null;
  share_url:       string | null;
  publicado:       boolean | null;
  resumen_publico: string | null;

  creado_matterport:     string | null;
  modificado_matterport: string | null;
  sincronizado_en:       string;
}

/** Modelo que Matterport no devolvió, con el motivo técnico. */
export interface MatterportErrorModelo {
  model_id: string;
  detalle:  string;
}

/** Resultado de `matterport-sync`: la sincronización puede ser parcial. */
export interface MatterportSincronizacion {
  sincronizados: number;
  fallidos:      number;
  errores:       MatterportErrorModelo[];
}
