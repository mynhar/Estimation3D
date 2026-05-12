import { EstadoExpediente } from '../types/supabase';

/** Forma aplanada usada en las listas del módulo estimador. */
export interface ExpedienteRow {
  id: string;
  numero: string;
  fecha_visita: string;
  estado?: string;
  servicio_nombre: string;
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
  cliente_nombre: string;
  cliente_telefono: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  estimador_nombre: string;
}

/** Forma aplanada usada en la lista de expedientes disponibles (módulo constructor). */
export interface ExpedienteDisponible {
  id: string;
  numero: string;
  estado: string;
  servicio_nombre: string;
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
  fecha_visita: string;
  servicio_nombre: string;
  servicio_descripcion: string;
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
  cliente_nombre: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
}

/** Forma usada en la vista del cliente (resultado de join anidado de Supabase). */
export interface ExpedienteCliente {
  id: number;
  numero: string;
  estado: string;
  fecha_visita: string;
  descripcion: string;
  servicio: { nombre_es: string } | null;
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

/** Forma aplanada para la vista de ofertas recibidas (módulo cliente). */
export interface ExpedienteConOfertas {
  id: string;
  numero: string;
  estado: string;
  fecha_visita: string;
  servicio_nombre: string;
  direccion: string;
  referencia: string;
  provincia: string;
  canton: string;
  distrito: string;
  total_ofertas: number;
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
