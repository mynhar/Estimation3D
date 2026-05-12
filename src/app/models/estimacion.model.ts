export interface EstimacionDetalle {
  fecha_visita_real: string;
  descripcion_problemas: string;
  costo_estimado: number | null;
  costo_estimado_max: number | null;
  notas_internas: string;
  url_tour: string | null;
}
