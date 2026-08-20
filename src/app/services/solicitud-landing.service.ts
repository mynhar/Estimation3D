import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { edgeError } from './edge-error.service';
import { Lang } from './lang.service';

/** Dirección canadiense del cliente, que es también la del inmueble. */
export interface DireccionSolicitud {
  numero_unidad: string;
  calle:         string;
  ciudad:        string;
  provincia_ca:  string;
  codigo_postal: string;
}

export interface SolicitudLanding {
  prenom:        string;
  nom:           string;
  telephone:     string;
  courriel:      string;
  typePropriete: string;
  servicioId:    number;
  adresse:       DireccionSolicitud;
  description:   string;
  idioma:        Lang;
}

export interface SolicitudCreada {
  expediente_id:  string;
  numero:         string;
  cliente_id:     string;
  /** false cuando el correo ya estaba registrado y solo se actualizaron sus datos. */
  usuario_nuevo:  boolean;
  fecha_visita:   string;
  correo_cliente: boolean;
  correo_interno: boolean;
}

/**
 * Alta pública desde la landing. Es la única llamada del proyecto que va sin
 * sesión: la edge function `crear-dossier-landing` corre con el service role
 * y se encarga de todo (usuario, perfil, expediente, localización, correos),
 * porque un visitante anónimo no puede escribir nada bajo RLS.
 */
@Injectable({ providedIn: 'root' })
export class SolicitudLandingService {
  async crear(solicitud: SolicitudLanding): Promise<SolicitudCreada> {
    const res = await fetch(`${environment.supabase.url}/functions/v1/crear-dossier-landing`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        // Sin sesión: la clave anónima es la credencial, igual que en cualquier
        // lectura pública de la landing.
        'apikey':        environment.supabase.anonKey,
        'Authorization': `Bearer ${environment.supabase.anonKey}`,
      },
      body: JSON.stringify(solicitud),
    });
    if (!res.ok) throw await edgeError(res);
    return res.json();
  }
}
