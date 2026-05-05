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
  total_ofertas: number;
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
  fecha_visita_real: string;
  total_ofertas: number;
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
export const ESTADOS_ESTIMADO: string[] = [
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
