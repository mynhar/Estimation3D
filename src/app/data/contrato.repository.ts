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

@Injectable({ providedIn: 'root' })
export class ContratoRepository {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async findHistorialByExpedienteId(expedienteId: string): Promise<ContratoHistorialItem | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, estado, generado_en, firmado_en, actualizado_en, oferta(fecha_inicio)')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) return null;
    return data as ContratoHistorialItem | null;
  }

  async findForClientByExpedienteId(expedienteId: string): Promise<ContratoClienteView | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) return null;
    return data as ContratoClienteView | null;
  }

  async findSimpleByExpedienteId(expedienteId: string): Promise<{ id: string; url_pdf: string | null } | null> {
    const { data, error } = await this.db
      .from('contrato')
      .select('id, url_pdf')
      .eq('expediente_id', expedienteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; url_pdf: string | null } | null;
  }

  async findByClienteId(clienteId: string): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo,
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
        id, precio_final, garantia_anos, estado, generado_en, firmado_en, url_pdf, descripcion_trabajo, constructor_id,
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
        id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo,
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
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton )
        ),
        cliente:cliente_id ( nombre, apellido ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio )
      `)
      .eq('constructor_id', constructorId)
      .in('estado', ['firmado', 'en_ejecucion', 'completado', 'cancelado'])
      .order('actualizado_en', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // Contratos de los expedientes que estimó este estimador.
  // Filtra por la columna estimador_id de la tabla embebida `expediente`
  // (join forzado con !inner para excluir contratos sin coincidencia).
  async findByEstimadorId(estimadorId: string): Promise<any[]> {
    const { data, error } = await this.db
      .from('contrato')
      .select(`
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo,
        expediente:expediente_id!inner (
          numero, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton )
        ),
        cliente:cliente_id ( nombre, apellido ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio )
      `)
      .eq('expediente.estimador_id', estimadorId)
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
        id, expediente_id, precio_final, garantia_anos, estado, generado_en, firmado_en, actualizado_en, url_pdf, descripcion_trabajo,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr ),
          localizacion ( direccion, provincia, canton )
        ),
        cliente:cliente_id ( nombre, apellido ),
        constructor:constructor_id ( nombre, apellido, telefono, email ),
        oferta:oferta_id ( plazo_semanas_min, plazo_semanas_max, fecha_inicio )
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
        id, precio_final, garantia_anos, estado, generado_en, firmado_en,
        expediente:expediente_id (
          id, numero, estado, estimador_id,
          servicio:servicio_id ( nombre_es, nombre_en, nombre_fr )
        ),
        cliente:cliente_id ( nombre, apellido ),
        constructor:constructor_id ( nombre, apellido ),
        oferta:oferta_id ( fecha_inicio )
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

  async cancelar(expedienteId: string): Promise<void> {
    const { error } = await this.db.rpc('cancelar_contrato', { p_expediente_id: expedienteId });
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
