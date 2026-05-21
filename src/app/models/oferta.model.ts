import { ArchivoRow } from './archivo.model';

/** Oferta con nombre del constructor y archivos adjuntos (vista cliente). */
export interface OfertaConConstructor {
  id: string;
  constructor_id: string;
  precio: number;
  plazo_semanas_min: number | null;
  plazo_semanas_max: number | null;
  garantia_anos: number | null;
  fecha_inicio: string;
  descripcion: string;
  estado: string;
  constructor_nombre:   string;
  constructor_telefono: string;
  constructor_email:    string;
  documentos: ArchivoRow[];
  videos: ArchivoRow[];
}

export interface OfertaDetalle {
  id: string;
  expediente_id: string;
  expediente_numero: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  fecha_visita: string;
  fecha_visita_real: string;
  descripcion_problemas: string;
  url_tour: string | null;
  precio: number;
  plazo_semanas_min: number | null;
  plazo_semanas_max: number | null;
  garantia_anos: number | null;
  fecha_inicio: string;
  descripcion: string;
  estado: string;
  creado_en: string;
}

export interface OfertaForm {
  precio: number | null;
  plazo_semanas_min: number | null;
  plazo_semanas_max: number | null;
  garantia_anos: number | null;
  fecha_inicio: string;
  descripcion: string;
}

export interface OfertaRow {
  id: string;
  expediente_numero: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  precio: number;
  fecha_inicio: string;
  plazo_semanas_min: number | null;
  plazo_semanas_max: number | null;
  estado: string;
}

export interface OfertaDashboard extends OfertaRow {
  expediente_id:     string;
  expediente_estado: string;
  creado_en:         string;
}

export const ESTADO_BADGE_OFERTA: Record<string, string> = {
  pendiente: 'bg-warning-subtle text-warning-emphasis',
  aceptada:  'bg-success-subtle text-success',
  rechazada: 'bg-danger-subtle text-danger',
};

export const ESTADO_LABEL_OFERTA: Record<string, string> = {
  pendiente: 'Pendiente',
  aceptada:  'Aceptada',
  rechazada: 'Rechazada',
};
