export interface ContratoListItem {
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
