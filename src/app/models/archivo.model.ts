export const BUCKET = 'archivos';

export interface ArchivoRow {
  id: string;
  nombre_archivo: string;
  url_storage: string;
  mime_type: string;
  tamano_bytes: number;
  subido_por?: string;
}
