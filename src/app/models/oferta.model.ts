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
