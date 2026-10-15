import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { ContratoInput } from '../models';

export type ContratoHistorialItem = {
  id:             string;
  estado:         string;
  generado_en:    string;
  firmado_en:     string | null;
  actualizado_en: string;
  oferta:         { fecha_inicio: string | null } | null;
};

export type ContratoClienteView = {
  id:                  string;
  precio_final:        number;
  garantia_anos:       number | null;
  estado:              string;
  generado_en:         string;
  firmado_en:          string | null;
  url_pdf:             string | null;
  descripcion_trabajo: string;
};

/**
 * Un contrato del expediente con el constructor al que pertenece. Desde que se
 * adjudica a varios, el nombre es lo único que distingue una tarjeta de otra.
 */
export type ContratoExpedienteView = ContratoClienteView & {
  oferta_id:          string;
  constructor_nombre: string;
};

@Injectable({ providedIn: 'root' })
export class ContratoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findHistorialByExpedienteId(expedienteId: string): Promise<ContratoHistorialItem | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, estado, generado_en, firmado_en, actualizado_en, oferta(fecha_inicio)')
      .eq('expediente_id', expedienteId)
      // El más reciente, no `maybeSingle()`: un expediente puede tener varios
      // contratos desde que administración adjudica a varios constructores, y
      // `maybeSingle()` lanzaría «multiple rows returned».
      .order('generado_en', { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0] ?? null) as ContratoHistorialItem | null;
  }

  async findHistorialByClienteId(clienteId: string): Promise<{
    id: string; expediente_id: string; estado: string;
    generado_en: string; firmado_en: string | null; actualizado_en: string;
  }[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, expediente_id, estado, generado_en, firmado_en, actualizado_en')
      .eq('cliente_id', clienteId);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string; expediente_id: string; estado: string;
      generado_en: string; firmado_en: string | null; actualizado_en: string;
    }[];
  }

  async findForClientByExpedienteId(expedienteId: string): Promise<ContratoClienteView | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo')
      .eq('expediente_id', expedienteId)
      // Idem: el más reciente. Ver findHistorialByExpedienteId.
      .order('generado_en', { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0] ?? null) as ContratoClienteView | null;
  }

  /**
   * Todos los contratos del expediente, el más reciente primero.
   *
   * Antes esto era un `maybeSingle()` que asumía un contrato por expediente.
   * Desde que administración puede adjudicar varias ofertas a la vez —un
   * contrato por oferta— esa consulta lanzaba «multiple rows returned» y se
   * llevaba por delante la pantalla de contrato del cliente.
   */
  async findSimplesByExpedienteId(
    expedienteId: string,
  ): Promise<{ id: string; oferta_id: string; url_pdf: string | null }[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, oferta_id, url_pdf')
      .eq('expediente_id', expedienteId)
      .order('generado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; oferta_id: string; url_pdf: string | null }[];
  }

  /**
   * TODOS los contratos del expediente, con el nombre de su constructor y el
   * más reciente primero. Es lo que necesita administración: un expediente
   * adjudicado a varios tiene un contrato por oferta y ninguno debe esconderse.
   */
  async findAllByExpedienteId(expedienteId: string): Promise<ContratoExpedienteView[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, oferta_id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo, constructor:constructor_id ( nombre, apellido )')
      .eq('expediente_id', expedienteId)
      .order('generado_en', { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map(row => {
      const r = row as unknown as ContratoClienteView & {
        oferta_id: string;
        constructor: { nombre: string; apellido: string } | null;
      };
      const c = r.constructor;
      return {
        ...r,
        constructor_nombre: c ? `${c.nombre} ${c.apellido}`.trim() || '—' : '—',
      } as ContratoExpedienteView;
    });
  }

  /** El contrato más reciente, para los flujos que sólo manejan uno. */
  async findSimpleByExpedienteId(
    expedienteId: string,
  ): Promise<{ id: string; oferta_id: string; url_pdf: string | null } | null> {
    return (await this.findSimplesByExpedienteId(expedienteId))[0] ?? null;
  }

  /**
   * Adjudica varias ofertas de una vez: un contrato por oferta, en una sola
   * transacción. Devuelve los contratos creados para que la aplicación genere
   * un PDF por cada uno.
   */
  async adjudicarOfertas(
    expedienteId: string,
    ofertaIds: string[],
  ): Promise<{ id_contrato: string; id_oferta: string }[]> {
    const { data, error } = await this.db.rpc('adjudicar_ofertas', {
      p_expediente_id: expedienteId,
      p_ofertas:       ofertaIds,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id_contrato: string; id_oferta: string }[];
  }

  async findByClienteId(clienteId: string): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo, servicio_ids,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr, descripcion_es, descripcion_en, descripcion_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        constructor:constructor_id ( nombre, apellido, telefono, email ),
        cliente:cliente_id ( nombre, apellido ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio )
      `)
      .eq('cliente_id', clienteId)
      .order('generado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findDetalleById(contratoId: string): Promise<any> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo, constructor_id, servicio_ids,
        expediente:expediente_id (
          id, numero, estado, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr, descripcion_es, descripcion_en, descripcion_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido, telefono, email ),
        constructor:constructor_id ( nombre, apellido, telefono, email ),
        oferta:oferta_id ( id, fecha_inicio, plazo_semanas_min, plazo_semanas_max )
      `)
      .eq('id', contratoId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findDetalleByIdForConstructor(contratoId: string, constructorId: string): Promise<any> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo, servicio_ids,
        expediente:expediente_id (
          id, numero, estado, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr, descripcion_es, descripcion_en, descripcion_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido, telefono, email ),
        constructor:constructor_id ( nombre, apellido, telefono, email ),
        oferta:oferta_id ( id, fecha_inicio, plazo_semanas_min, plazo_semanas_max )
      `)
      .eq('id', contratoId)
      .eq('constructor_id', constructorId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findByConstructorId(constructorId: string): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo, servicio_ids,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio ),
        seguimiento:seguimiento_obra ( estado, porcentaje_avance )
      `)
      .eq('constructor_id', constructorId)
      .in('estado', ['firmado', 'en_ejecucion', 'completado', 'cancelado'])
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /**
   * Expedientes de un estimador, por las dos vías que lo vinculan:
   * `expediente.estimador_id` (asignación actual, que se reescribe al reasignar
   * y se pone a NULL al desasignar) y `estimacion.estimador_id` (autoría de la
   * estimación, que es estable). Filtrar solo por la primera hace desaparecer
   * las obras que el estimador estimó en cuanto el expediente cambia de manos.
   */
  private async findExpedienteIdsDeEstimador(estimadorId: string): Promise<string[]> {
    const [asignados, estimados] = await Promise.all([
      this.db.from('expediente').select('id').eq('estimador_id', estimadorId),
      this.db.from('estimacion').select('expediente_id').eq('estimador_id', estimadorId),
    ]);
    if (asignados.error)  throw new Error(asignados.error.message);
    if (estimados.error)  throw new Error(estimados.error.message);

    const ids = new Set<string>();
    for (const r of asignados.data ?? []) ids.add((r as { id: string }).id);
    for (const r of estimados.data ?? []) ids.add((r as { expediente_id: string }).expediente_id);
    return [...ids];
  }

  // Contratos de los expedientes que estimó este estimador.
  async findByEstimadorId(estimadorId: string): Promise<any[]> {
    const expedienteIds = await this.findExpedienteIdsDeEstimador(estimadorId);
    if (expedienteIds.length === 0) return [];

    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo, servicio_ids,
        expediente:expediente_id!inner (
          numero, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio ),
        seguimiento:seguimiento_obra ( estado, porcentaje_avance )
      `)
      .in('expediente_id', expedienteIds)
      .in('estado', ['firmado', 'en_ejecucion', 'completado', 'cancelado'])
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // Seguimiento de obra (admin): todos los contratos con obra (firmado en
  // adelante), ordenados por actualizado_en desc.
  async findAllForMonitoring(): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo, servicio_ids,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido ),
        constructor:constructor_id ( nombre, apellido, telefono, email ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio ),
        seguimiento:seguimiento_obra ( estado, porcentaje_avance )
      `)
      .in('estado', ['firmado', 'en_ejecucion', 'completado', 'cancelado'])
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findAllAdmin(): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, precio_final, garantia_anos, estado, generado_en, firmado_en, servicio_ids,
        expediente:expediente_id (
          id, numero, estado, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton, distrito )
        ),
        cliente:cliente_id ( nombre, apellido ),
        constructor:constructor_id ( nombre, apellido ),
        oferta:oferta_id ( fecha_inicio ),
        seguimiento:seguimiento_obra ( estado, porcentaje_avance )
      `)
      .order('generado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findPerfilById(userId: string): Promise<{ nombre: string; apellido: string; telefono: string; email: string } | null> {
    const { data } = await this.db
      .from('perfil')
      .select('nombre, apellido, telefono, email')
      .eq('id', userId)
      .single();
    return data as { nombre: string; apellido: string; telefono: string; email: string } | null;
  }

  async findPerfilesByIds(ids: string[]): Promise<{ id: string; nombre: string; apellido: string }[]> {
    if (!ids.length) return [];
    const { data } = await this.db
      .from('perfil')
      .select('id, nombre, apellido')
      .in('id', ids);
    return (data ?? []) as { id: string; nombre: string; apellido: string }[];
  }

  async insert(input: ContratoInput): Promise<string> {
    const { data, error } = await this.db
      .from('contrato')
      .insert({
        expediente_id:       input.expediente_id,
        oferta_id:           input.oferta_id,
        cliente_id:          input.cliente_id,
        constructor_id:      input.constructor_id,
        precio_final:        input.precio_final,
        garantia_anos:       input.garantia_anos,
        descripcion_trabajo: input.descripcion_trabajo,
        estado:              'generado',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async updateUrlPdf(contratoId: string, urlPdf: string): Promise<void> {
    const { error } = await this.db
      .from('contrato')
      .update({ url_pdf: urlPdf })
      .eq('id', contratoId);
    if (error) throw new Error(error.message);
  }

  async deleteById(contratoId: string): Promise<void> {
    const { error } = await this.db
      .from('contrato')
      .delete()
      .eq('id', contratoId);
    if (error) throw new Error(error.message);
  }

  async uploadPdf(pdfBlob: Blob, contratoId: string): Promise<string> {
    const path = `${contratoId}.pdf`;
    const { error } = await this.db.storage
      .from('contratos')
      .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.db.storage
      .from('contratos')
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async removePdfFromStorage(path: string): Promise<void> {
    await this.db.storage.from('contratos').remove([path]);
  }

  /**
   * El cliente cancela UN contrato suyo. Antes esto llamaba a
   * `cancelar_contrato(p_expediente_id)`, que borraba todos los contratos del
   * expediente y reseteaba todas las ofertas: con varios constructores
   * adjudicados, cancelar uno se llevaba por delante a los demás.
   */
  async cancelarCliente(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('cancelar_contrato_cliente', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  async cancelarAdmin(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('cancelar_contrato_admin', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  async firmarAdmin(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('firmar_contrato_admin', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  async iniciarEjecucionAdmin(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('iniciar_ejecucion_contrato_admin', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  // Constructor adjudicado: transiciona su contrato 'firmado' → 'en_ejecucion'.
  async iniciarEjecucion(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('iniciar_ejecucion_contrato', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  async completarAdmin(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('completar_contrato_admin', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }

  async firmar(contratoId: string): Promise<void> {
    const { error } = await this.db.rpc('firmar_contrato', { p_contrato_id: contratoId });
    if (error) throw new Error(error.message);
  }
}
