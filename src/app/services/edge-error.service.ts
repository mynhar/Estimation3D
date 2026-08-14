import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Error de una edge function con código estable.
 *
 * Las funciones devuelven `{ code, error, detail? }`: `code` es el identificador
 * traducible y `error` el texto en español que se conserva para los logs. El
 * frontend NUNCA debe mostrar `error` — antes lo hacía, y por eso un usuario en
 * francés o inglés veía «Acceso denegado: el estimador solo puede crear usuarios
 * con rol cliente». `detail` solo lleva mensajes técnicos de terceros (GoTrue,
 * Resend, Postgres) que no se pueden traducir.
 */
export class EdgeError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'EdgeError';
  }
}

/** Códigos que devuelven las edge functions → clave de i18n. */
const CLAVE_POR_CODIGO: Record<string, string> = {
  // Comunes a las cuatro funciones
  no_autorizado:           'edge_errors.no_autorizado',
  token_invalido:          'edge_errors.token_invalido',
  rol_no_permitido:        'edge_errors.rol_no_permitido',
  campos_requeridos:       'edge_errors.campos_requeridos',
  error_interno:           'edge_errors.error_interno',
  // crear-usuario / actualizar-usuario
  estimador_rol_no_permitido: 'edge_errors.estimador_rol_no_permitido',
  email_duplicado:         'edge_errors.email_duplicado',
  auth_error:              'edge_errors.auth_error',
  perfil_error:            'edge_errors.perfil_error',
  // enviar-invitacion
  solo_admin:              'edge_errors.solo_admin',
  expediente_no_encontrado:'edge_errors.expediente_no_encontrado',
  expediente_no_estimado:  'edge_errors.expediente_no_estimado',
  sin_correo:              'edge_errors.sin_correo',
  resend_no_configurado:   'edge_errors.resend_no_configurado',
  envio_fallido:           'edge_errors.envio_fallido',
  // enviar-credenciales
  usuario_no_encontrado:   'edge_errors.usuario_no_encontrado',
  usuario_sin_correo:      'edge_errors.usuario_sin_correo',
  proveedor_no_email:      'edge_errors.proveedor_no_email',
  password_requerida:      'edge_errors.password_requerida',
  password_corta:          'edge_errors.password_corta',
  envio_credenciales_fallido: 'edge_errors.envio_credenciales_fallido',
  password_no_aplicada:       'edge_errors.password_no_aplicada',
  // asistente-ia
  servicio_no_configurado: 'edge_errors.servicio_no_configurado',
  falta_expediente:        'edge_errors.falta_expediente',
  ultimo_mensaje_usuario:  'edge_errors.ultimo_mensaje_usuario',
  expediente_sin_acceso:   'edge_errors.expediente_sin_acceso',
  asistente_no_disponible: 'edge_errors.asistente_no_disponible',
  // Validaciones del propio cliente, antes de llamar a ninguna función
  archivo_muy_grande:      'admin_users.err_file_size',
};

/**
 * Convierte una respuesta HTTP fallida de una edge function en un `EdgeError`.
 * Si el cuerpo no trae `code` (función antigua todavía desplegada, o error de
 * la propia pasarela) se cae a `error_interno`, que sí está traducido.
 */
export async function edgeError(res: Response): Promise<EdgeError> {
  const payload = await res.json().catch(() => ({} as Record<string, unknown>));
  const code   = typeof payload['code']   === 'string' ? payload['code'] as string   : 'error_interno';
  const detail = typeof payload['detail'] === 'string' ? payload['detail'] as string : undefined;
  return new EdgeError(code, detail, res.status);
}

@Injectable({ providedIn: 'root' })
export class EdgeErrorService {
  private translate = inject(TranslateService);

  /**
   * Mensaje traducido para mostrar al usuario. `claveFallback` cubre lo que no
   * viene de una edge function (fallos de Storage, de red o de PostgREST), que
   * tampoco están traducidos y no deben salir crudos a la interfaz.
   */
  mensaje(e: unknown, claveFallback: string): string {
    const detail = e instanceof EdgeError ? e.detail : undefined;
    return this.translate.instant(this.clave(e, claveFallback), detail ? { detail } : undefined);
  }

  /**
   * Igual que `mensaje()`, pero devuelve la clave sin resolver. Para las
   * pantallas que guardan la clave en un signal y la traducen en la plantilla
   * con el pipe `translate`.
   */
  clave(e: unknown, claveFallback: string): string {
    const clave = e instanceof EdgeError ? CLAVE_POR_CODIGO[e.code] : undefined;
    return clave ?? claveFallback;
  }
}
