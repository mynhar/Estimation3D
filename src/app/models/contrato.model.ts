export interface ContratoListItem {
  // ── campos visuales ───────────────────────────────────────────────────────
  id:                 string;
  expediente_id:      string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  constructor_nombre: string;
  precio_final:       number;
  garantia_anos:      number | null;
  estado:             string;
  generado_en:        string;
  firmado_en:         string | null;
  url_pdf:            string | null;

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

export interface ContratoPdfData {
  contratoId:          string;
  expedienteNumero:    string;
  fechaGenerado:       string;
  clienteNombre:       string;
  constructorNombre:   string;
  constructorTelefono: string;
  constructorEmail:    string;
  servicioNombre:      string;
  servicioDescripcion: string;
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
