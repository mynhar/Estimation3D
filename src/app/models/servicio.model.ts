export interface Servicio {
  id: number;
  codigo: string;
  nombre_fr: string;
  nombre_en: string;
  nombre_es: string;
  descripcion_fr?: string;
  descripcion_en?: string;
  descripcion_es?: string;
}

export const PROVINCIAS: string[] = [
  'San José', 'Alajuela', 'Cartago', 'Heredia',
  'Guanacaste', 'Puntarenas', 'Limón',
];

export const PROVINCIAS_CANADA: { code: string; nombre: string }[] = [
  { code: 'AB', nombre: 'Alberta' },
  { code: 'BC', nombre: 'British Columbia' },
  { code: 'MB', nombre: 'Manitoba' },
  { code: 'NB', nombre: 'New Brunswick' },
  { code: 'NL', nombre: 'Newfoundland and Labrador' },
  { code: 'NS', nombre: 'Nova Scotia' },
  { code: 'NT', nombre: 'Northwest Territories' },
  { code: 'NU', nombre: 'Nunavut' },
  { code: 'ON', nombre: 'Ontario' },
  { code: 'PE', nombre: 'Prince Edward Island' },
  { code: 'QC', nombre: 'Quebec' },
  { code: 'SK', nombre: 'Saskatchewan' },
  { code: 'YT', nombre: 'Yukon' },
];

export const SERVICIOS_FALLBACK: Servicio[] = [
  {
    id: 1, codigo: 'descontaminacion_moho',
    nombre_fr: 'Décontamination de moisissures',
    nombre_en: 'Mold decontamination',
    nombre_es: 'Descontaminación de moho',
    descripcion_fr: 'Confinement, pression négative, HEPA, biocides, test d\'air final, certification',
    descripcion_en: 'Containment, negative pressure, HEPA, biocides, final air test, certification',
    descripcion_es: 'Confinamiento, presión negativa, HEPA, biocidas, test de aire final, certificación',
  },
  {
    id: 2, codigo: 'desamiantado',
    nombre_fr: 'Désamiantage',
    nombre_en: 'Asbestos removal',
    nombre_es: 'Desamiantado',
    descripcion_fr: 'Plan CNESST, sas décontamination, Loi R-20, manifeste transport, conservation 10 ans',
    descripcion_en: 'CNESST plan, decontamination airlock, R-20 Law, transport manifest, 10-year retention',
    descripcion_es: 'Plan CNESST, esclusa de descontaminación, Ley R-20, manifiesto transporte, conservación 10 años',
  },
  {
    id: 3, codigo: 'danos_por_agua',
    nombre_fr: 'Dommages par l\'eau',
    nombre_en: 'Water damage',
    nombre_es: 'Daños por agua',
    descripcion_fr: 'Catégories 1-2-3, extraction, séchage LGR, monitorage 24h, certification IICRC',
    descripcion_en: 'Categories 1-2-3, extraction, LGR drying, 24h monitoring, IICRC certification',
    descripcion_es: 'Categorías 1-2-3, extracción, secado LGR, monitoreo 24h, certificación IICRC',
  },
  {
    id: 4, codigo: 'demolicion_interior',
    nombre_fr: 'Démolition intérieure contrôlée',
    nombre_en: 'Controlled interior demolition',
    nombre_es: 'Demolición interior controlada',
    descripcion_fr: 'Vérification amiante/plomb, murs portants, protection, gestion des débris',
    descripcion_en: 'Asbestos/lead check, load-bearing walls, protection, debris management',
    descripcion_es: 'Verificación amianto/plomo, muros portantes, protección, gestión escombros',
  },
  {
    id: 5, codigo: 'aislamiento',
    nombre_fr: 'Isolation (retrait et installation)',
    nombre_en: 'Insulation (removal and installation)',
    nombre_es: 'Aislamiento (retiro e instalación)',
    descripcion_fr: 'Valeur R, test amiante vermiculite, barrière vapeur, certification ÉcoRénov',
    descripcion_en: 'R-value, vermiculite asbestos test, vapour barrier, ÉcoRénov certification',
    descripcion_es: 'Valor R, test amianto vermiculita, barrera de vapor, certificación ÉcoRénov',
  },
  {
    id: 6, codigo: 'fundacion_dren_frances',
    nombre_fr: 'Fondation + drain français',
    nombre_en: 'Foundation + French drain',
    nombre_es: 'Fundación + dren francés',
    descripcion_fr: 'Injection époxy/polyuréthane, Info-Excavation, membrane, garantie 10 ans',
    descripcion_en: 'Epoxy/polyurethane injection, Info-Excavation, membrane, 10-year warranty',
    descripcion_es: 'Inyección epoxi/poliuretano, Info-Excavation, membrana, garantía 10 años',
  },
];
