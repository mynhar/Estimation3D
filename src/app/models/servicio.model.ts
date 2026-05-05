export interface Servicio {
  id: number;
  codigo: string;
  nombre_es: string;
  descripcion_es: string;
}

export const PROVINCIAS: string[] = [
  'San José', 'Alajuela', 'Cartago', 'Heredia',
  'Guanacaste', 'Puntarenas', 'Limón',
];

export const SERVICIOS_FALLBACK: Servicio[] = [
  { id: 1, codigo: 'descontaminacion_moho',   nombre_es: 'Descontaminación de moho',           descripcion_es: 'Confinamiento, presión negativa, HEPA, biocidas, test de aire final, certificación.' },
  { id: 2, codigo: 'desamiantado',             nombre_es: 'Desamiantado',                       descripcion_es: 'Plan CNESST, Ley R-20, manifiesto transporte, conservación 10 años.' },
  { id: 3, codigo: 'danos_agua',               nombre_es: 'Daños por agua',                     descripcion_es: 'Categorías 1-2-3, extracción, secado LGR, certificación IICRC.' },
  { id: 4, codigo: 'demolicion_interior',      nombre_es: 'Demolición interior controlada',     descripcion_es: 'Verificación amianto/plomo, muros portantes, gestión escombros.' },
  { id: 5, codigo: 'aislamiento',              nombre_es: 'Aislamiento (retiro e instalación)', descripcion_es: 'Valor R, test amianto vermiculita, certificación ÉcoRénov.' },
  { id: 6, codigo: 'fundacion_dren_frances',   nombre_es: 'Fundación + dren francés',           descripcion_es: 'Inyección epoxi/poliuretano, Info-Excavation, garantía 10 años.' },
];
