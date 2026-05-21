export interface ContratoListItem {
  // ── campos visuales ───────────────────────────────────────────────────────
  id:                 string;
  expediente_numero:  string;
  servicio_nombre:    string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  constructor_nombre: string;
  precio_final:       number;
  garantia_anos:      number | null;
  estado:             string;
  generado_en:        string;
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
