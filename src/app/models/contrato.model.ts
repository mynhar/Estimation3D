export interface ContratoListItem {
  // ── campos visuales ───────────────────────────────────────────────────────
  id:                 string;
  expediente_id:      string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  /** Servicios del contrato (`contrato.servicio_ids`); si no se pudieron leer, el principal. */
  servicios?:         ServicioContrato[];
  constructor_nombre: string;
  precio_final:       number;
  garantia_anos:      number | null;
  estado:             string;
  generado_en:        string;
  firmado_en:         string | null;
  url_pdf:            string | null;
  /** La obra llegó al 100 % y el contrato sigue abierto (falta que administración lo complete). */
  obra_terminada?:    boolean;

  // ── datos para regenerar el PDF en cualquier idioma ───────────────────────
  cliente_nombre:       string;
  constructor_telefono: string;
  constructor_email:    string;
  servicio_desc:        string;
  servicio_desc_en:     string;
  servicio_desc_fr:     string;
  direccion:            string;
  provincia:            string;
  canton:               string;
  distrito:             string | null;
  plazo_semanas_min:    number | null;
  plazo_semanas_max:    number | null;
  fecha_inicio:         string | null;
  descripcion_trabajo:  string;
}

export interface ContratoInput {
  expediente_id:       string;
  oferta_id:           string;
  cliente_id:          string;
  constructor_id:      string;
  precio_final:        number;
  garantia_anos:       number | null;
  descripcion_trabajo: string;
}

/** Vista completa de un contrato para el detalle admin. */
export interface ContratoAdminDetalle {
  id:                   string;
  precio_final:         number;
  garantia_anos:        number | null;
  estado:               string;
  generado_en:          string;
  firmado_en:           string | null;
  url_pdf:              string | null;
  descripcion_trabajo:  string;
  expediente_id:        string;
  expediente_numero:    string;
  expediente_estado:    string;
  servicio_nombre:      string;
  servicio_nombre_en:   string;
  servicio_nombre_fr:   string;
  servicio_desc:        string;
  servicio_desc_en:     string;
  servicio_desc_fr:     string;
  direccion:            string;
  provincia:            string;
  canton:               string;
  distrito:             string | null;
  cliente_nombre:       string;
  cliente_telefono:     string;
  cliente_email:        string;
  constructor_id:       string;
  constructor_nombre:   string;
  constructor_telefono: string;
  constructor_email:    string;
  estimador_nombre:     string | null;
  estimador_telefono:   string | null;
  estimador_email:      string | null;
  oferta_id:            string;
  /**
   * Servicios del contrato: los que cubre su oferta, en el orden del
   * expediente. Si no se pudieron leer, el principal (`servicio_*`).
   */
  servicios:            ServicioContrato[];
  oferta_fecha_inicio:  string | null;
  plazo_semanas_min:    number | null;
  plazo_semanas_max:    number | null;
}

/** Vista aplanada para la lista admin de contratos (expedientes adjudicado/contratado). */
export interface ContratoAdminListItem {
  contrato_id:         string;
  precio_final:        number;
  garantia_anos:       number | null;
  contrato_estado:     string;
  generado_en:         string;
  firmado_en:          string | null;
  expediente_id:       string;
  expediente_numero:   string;
  expediente_estado:   string;
  servicio_nombre:     string;
  servicio_nombre_en:  string;
  servicio_nombre_fr:  string;
  /** Servicios del contrato (los de su oferta); si no se pudieron leer, el principal. */
  servicios:           ServicioContrato[];
  /** La obra llegó al 100 % y el contrato sigue abierto: falta completarlo. */
  obra_terminada:      boolean;
  cliente_nombre:      string;
  estimador_nombre:    string | null;
  constructor_nombre:  string | null;
  oferta_fecha_inicio: string | null;
  foto:                string | null;  // miniatura del tour 3D (Matterport) del expediente
  // Dirección. En Canadá `direccion` contiene "unidad-cívico calle",
  // `canton` la ciudad y `distrito` el código postal.
  direccion:           string;
  provincia:           string;
  canton:              string;
  distrito:            string;
}

export interface ContratoConstructorListItem {
  id:                 string;
  expediente_id:      string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  /**
   * Servicios del contrato (`contrato.servicio_ids`); si no se pudieron leer,
   * el principal. Lo rellenan las listas de seguimiento (admin, estimador,
   * constructor).
   */
  servicios?:         ServicioContrato[];
  /** La obra llegó al 100 % y el contrato sigue abierto (si la consulta trae el seguimiento). */
  obra_terminada?:    boolean;
  cliente_nombre:     string;
  constructor_nombre:   string;
  constructor_telefono: string;
  constructor_email:    string;
  precio_final:       number;
  garantia_anos:      number | null;
  estado:             string;
  generado_en:        string;
  firmado_en:         string | null;
  actualizado_en:     string;
  url_pdf:            string | null;
  fecha_inicio:       string | null;
  plazo_semanas_min:  number | null;
  plazo_semanas_max:  number | null;
  // Dirección. En Canadá `direccion` contiene "unidad-cívico calle",
  // `canton` la ciudad y `distrito` el código postal.
  direccion:          string;
  provincia:          string;
  canton:             string;
  distrito:           string;
  foto:               string | null;  // miniatura del tour 3D (Matterport) del expediente
}

/**
 * Lo mínimo de cada contrato para marcar, en las listas del cliente
 * (mis expedientes, ofertas recibidas), cuáles tienen la obra al 100 %.
 */
export interface ContratoObraResumen {
  id:             string;
  expediente_id:  string;
  oferta_id:      string;
  estado:         string;
  /** Servicios del contrato; sin ellos, el principal del expediente. */
  servicios:      ServicioContrato[];
  /** Obra al 100 % con el contrato aún abierto (misma regla que administración). */
  obra_terminada: boolean;
}

/** Estado de la obra de un contrato, tal como lo lee el cliente en su panel. */
export type ObraEstadoPanel = 'por_iniciar' | 'en_curso' | 'pausada' | 'completada' | 'cancelada';

/**
 * Un contrato del expediente en el panel del cliente. Un expediente puede tener
 * varios —uno por oferta adjudicada— y el panel los enseña todos, cada uno con
 * el avance de su obra (`seguimiento_obra.porcentaje_avance`).
 */
export interface ContratoPanelCliente {
  id:                   string;
  estado:               string;
  precio_final:         number;
  garantia_anos:        number | null;
  descripcion_trabajo:  string;
  generado_en:          string;
  firmado_en:           string | null;
  actualizado_en:       string;
  fecha_inicio:         string | null;
  /** URL firmada del PDF (1 h). Null si el contrato no tiene PDF o no se pudo firmar. */
  pdf_url:              string | null;
  constructor_nombre:   string;
  constructor_telefono: string | null;
  constructor_email:    string | null;
  /** Servicios del contrato; sin ellos, el principal del expediente. */
  servicios:            ServicioContrato[];
  /** Avance de la obra, 0–100 entero. 100 si el contrato está completado; 0 sin seguimiento. */
  avance_obra:          number;
  obra_estado:          ObraEstadoPanel;
  /** Última actualización del seguimiento; null si la obra aún no tiene seguimiento. */
  obra_actualizado_en:  string | null;
}

/** Un servicio tal como aparece en el PDF del contrato, ya traducido. */
export interface ServicioPdf {
  nombre:      string;
  descripcion: string;
}

/** Textos de un servicio en los tres idiomas (catálogo `servicio`). */
export interface ServicioContrato {
  id:             number;
  nombre_es:      string;
  nombre_en:      string | null;
  nombre_fr:      string | null;
  descripcion_es: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
}

export interface ContratoPdfData {
  contratoId:          string;
  expedienteNumero:    string;
  fechaGenerado:       string;
  clienteNombre:       string;
  constructorNombre:   string;
  constructorTelefono: string;
  constructorEmail:    string;
  /**
   * Servicios del contrato (los de su oferta), cada uno con su descripción.
   * Si llega, sustituye a `servicioNombre` / `servicioDescripcion`.
   */
  servicios?:          ServicioPdf[];
  /** Forma antigua, un solo servicio. La usan las pantallas que aún no pasan `servicios`. */
  servicioNombre?:      string;
  servicioDescripcion?: string;
  direccion:           string;
  canton:              string;
  provincia:           string;
  distrito:            string;
  precioFinal:         number;
  plazoMin:            number | null;
  plazoMax:            number | null;
  garantiaAnos:        number | null;
  fechaInicio:         string;
  descripcionTrabajo:  string;
  lang:                string;
}
