import { EstadoExpediente } from '../types/supabase';

/** Datos completos de un expediente para edición admin. */
export interface ExpedienteParaEdicion {
  id:            string;
  numero:        string;
  estado:        string;
  servicio_id:   number;
  cliente_id:    string;
  fecha_visita:  string;
  descripcion:   string | null;
  tipo_inmueble: string;
  direccion:     string;
  provincia:     string;
  canton:        string;
  distrito:      string;
  referencia:    string | null;
  latitud:       number | null;
  longitud:      number | null;
}

/** Vista aplanada para la lista admin de ofertas (estados: estimado, en_oferta, adjudicado). */
export interface ExpedienteConOfertaAdmin {
  id:                  string;
  numero:              string;
  estado:              string;
  creado_en:           string;
  servicio_nombre:     string;
  servicio_nombre_en:  string;
  servicio_nombre_fr:  string;
  cliente_nombre:      string;
  estimador_nombre:    string | null;
  oferta_id:           string | null;
  constructor_nombre:  string | null;
  oferta_precio:       number | null;
  oferta_fecha_inicio: string | null;
  oferta_estado:       string | null;
  total_ofertas:       number;
  sort_date:           string;
}

/** Vista aplanada para la lista admin de expedientes a estimar (estados: nuevo, en_estimacion, estimado). */
export interface ExpedienteParaEstimar {
  id:                  string;
  numero:              string;
  estado:              string;
  fecha_visita:        string;
  creado_en:           string;
  servicio_nombre:     string;
  servicio_nombre_en:  string;
  servicio_nombre_fr:  string;
  cliente_nombre:      string;
  estimador_nombre:    string | null;
  fecha_visita_real:   string | null;
  costo_estimado:      number | null;
  costo_estimado_max:  number | null;
}

/** Vista aplanada para la lista admin de expedientes. */
export interface ExpedienteAdmin {
  id:                   string;
  numero:               string;
  estado:               string;
  fecha_visita:         string;
  servicio_nombre:      string;
  servicio_nombre_en:   string;
  servicio_nombre_fr:   string;
  cliente_nombre:       string;
  estimador_nombre:     string | null;
  fecha_visita_real:    string | null;
  oferta_precio:        number | null;
  oferta_fecha_inicio:  string | null;
}

/** Forma aplanada usada en las listas del módulo estimador. */
export interface ExpedienteRow {
  id: string;
  numero: string;
  fecha_visita: string;
  estado?: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  cliente_nombre: string;
  direccion: string;
  provincia: string;
  canton: string;
  distrito: string;
}

/** Vista de detalle de un expediente (join completo). */
export interface ExpedienteDetalle {
  numero: string;
  estado: string;
  fecha_visita: string;
  descripcion?: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  estimador_id: string | null;
  estimador_nombre: string;
}

/** Forma aplanada usada en la lista de expedientes disponibles (módulo constructor). */
export interface ExpedienteDisponible {
  id: string;
  numero: string;
  estado: string;
  creado_en: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  direccion: string;
  provincia: string;
  canton: string;
  distrito: string;
  costo_estimado: number | null;
  costo_estimado_max: number | null;
  total_ofertas: number;
}

/** Vista completa del expediente para el cliente (detalle propio). */
export interface ExpedienteVistaCliente {
  id: string;
  numero: string;
  estado: string;
  fecha_visita: string;
  creado_en: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  cliente_nombre: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  estimador_nombre: string | null;
  fecha_visita_real: string | null;
  descripcion_problemas: string | null;
  costo_estimado: number | null;
  costo_estimado_max: number | null;
  url_tour: string | null;
}

/** Forma completa para la vista de oferta del constructor. */
export interface ExpedienteParaOferta {
  id: string;
  numero: string;
  estado: string;
  cliente_nombre: string;
  fecha_visita: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  servicio_descripcion: string;
  servicio_descripcion_en: string;
  servicio_descripcion_fr: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  descripcion_problemas: string;
  costo_estimado: number | null;
  costo_estimado_max: number | null;
  fecha_visita_real: string;
  url_tour: string | null;
  total_ofertas: number;
}

/** Forma completa para la vista detalle del cliente (builder-offer). */
export interface ExpedienteDetalleCliente {
  id: string;
  numero: string;
  estado: string;
  fecha_visita: string;
  creado_en: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  servicio_descripcion: string;
  servicio_descripcion_en: string;
  servicio_descripcion_fr: string;
  cliente_nombre: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
}

/** Forma usada en la vista del cliente (resultado de join anidado de Supabase). */
export interface ExpedienteCliente {
  id: string;
  numero: string;
  estado: string;
  fecha_visita: string;
  creado_en: string;
  descripcion: string;
  servicio: { nombre_fr: string; nombre_en: string; nombre_es: string } | null;
}

// ── Constantes de estado ──────────────────────────────────────────────────────

/** Estados post-estimación que maneja el módulo estimador. */
export const ESTADOS_ESTIMADO: EstadoExpediente[] = [
  'estimado', 'en_oferta', 'adjudicado', 'contratado', 'cancelado',
];

/** Mapa estado → { texto, clase } para la vista de mis expedientes (cliente). */
export const ESTADO_BADGE_CLIENTE: Record<string, { texto: string; clase: string }> = {
  nuevo:      { texto: 'Nuevo',      clase: 'bg-primary' },
  asignado:   { texto: 'Asignado',   clase: 'bg-warning text-dark' },
  en_proceso: { texto: 'En proceso', clase: 'bg-info text-dark' },
  completado: { texto: 'Completado', clase: 'bg-success' },
  cancelado:  { texto: 'Cancelado',  clase: 'bg-secondary' },
};

/** Oferta resumida para mostrar dentro de un expediente (vista cliente). */
export interface OfertaResumen {
  id:                 string;
  constructor_nombre: string;
  precio:             number;
  estado:             string;
  plazo_semanas_min:  number | null;
  plazo_semanas_max:  number | null;
}

/** Forma aplanada para la vista de ofertas recibidas (módulo cliente). */
export interface ExpedienteConOfertas {
  id: string;
  numero: string;
  estado: string;
  fecha_visita: string;
  servicio_nombre: string;
  servicio_nombre_en: string;
  servicio_nombre_fr: string;
  servicio_descripcion: string;
  servicio_descripcion_en: string;
  servicio_descripcion_fr: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  total_ofertas: number;
  ofertas: OfertaResumen[];
}

/** Mapa estado → { texto, clase } para la vista de ofertas recibidas (cliente). */
export const ESTADO_BADGE_OFERTA_RECIBIDA: Record<string, { texto: string; clase: string }> = {
  en_oferta:  { texto: 'En oferta',  clase: 'bg-primary' },
  adjudicado: { texto: 'Adjudicado', clase: 'bg-warning text-dark' },
  contratado: { texto: 'Contratado', clase: 'bg-success' },
  cancelado:  { texto: 'Cancelado',  clase: 'bg-secondary' },
};

/** Mapa estado → clase CSS de badge para la lista de expedientes estimados. */
export const ESTADO_BADGE_ESTIMADOR: Record<string, string> = {
  estimado:   'bg-success-subtle text-success',
  en_oferta:  'bg-primary-subtle text-primary',
  adjudicado: 'bg-warning-subtle text-warning-emphasis',
  contratado: 'bg-info-subtle text-info-emphasis',
  cancelado:  'bg-secondary-subtle text-secondary',
};

/** Mapa estado → etiqueta legible para la lista de expedientes estimados. */
export const ESTADO_LABEL_ESTIMADOR: Record<string, string> = {
  estimado:   'Estimado',
  en_oferta:  'En oferta',
  adjudicado: 'Adjudicado',
  contratado: 'Contratado',
  cancelado:  'Cancelado',
};
