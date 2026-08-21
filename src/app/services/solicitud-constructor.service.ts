import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { edgeError } from './edge-error.service';
import { Lang } from './lang.service';

/** Candidatura del formulario público «Devenir entrepreneur partenaire». */
export interface CandidaturaConstructor {
  entreprise:  string;
  prenom:      string;
  nom:         string;
  telephone:   string;
  courriel:    string;
  rbq:         string;
  /** true = cubre todos los servicios; entonces `specialites` va vacío. */
  toutes:      boolean;
  specialites: number[];
  annees:      number;
  zone:        string;
  message:     string;
  idioma:      Lang;
}

export interface CandidaturaCreada {
  constructor_id:     string;
  /** false cuando el correo ya era de un constructor y solo se actualizó su ficha. */
  usuario_nuevo:      boolean;
  correo_constructor: boolean;
  correo_interno:     boolean;
}

/**
 * Alta pública de constructores. Va sin sesión, como la de la landing: la edge
 * function `crear-constructor-landing` corre con el service role y se encarga
 * de todo (usuario, perfil, especialidades, correos), porque un visitante
 * anónimo no puede escribir nada bajo RLS.
 */
@Injectable({ providedIn: 'root' })
export class SolicitudConstructorService {
  async crear(candidatura: CandidaturaConstructor): Promise<CandidaturaCreada> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/crear-constructor-landing`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        // Sin sesión: la clave anónima es la credencial, igual que en cualquier
        // lectura pública del sitio.
        'apikey':        environment.supabase.anonKey,
        'Authorization': `Bearer ${environment.supabase.anonKey}`,
      },
      body: JSON.stringify(candidatura),
    });
    if (!res.ok) throw await edgeError(res);
    return res.json();
  }
}
