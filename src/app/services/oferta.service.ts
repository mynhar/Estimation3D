import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { OfertaConConstructor, OfertaDashboard, OfertaDetalle, OfertaForm, OfertaRow, ArchivoRow, BUCKET } from '../models';

@Injectable({ providedIn: 'root' })
export class OfertaService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async getOfertasDeExpediente(expedienteId: string): Promise<OfertaConConstructor[]> {
    const { data: ofertas, error } = await this.db
      .from('oferta')
      .select('id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion, estado, constructor_id')
      .eq('expediente_id', expedienteId)
      .order('precio', { ascending: true });

    if (error) throw new Error(error.message);
    if (!ofertas?.length) return [];

    const constructorIds = [...new Set(ofertas.map((o: any) => o.constructor_id))];
    const ofertaIds      = ofertas.map((o: any) => o.id);

    const [perfilesRes, archivosRes] = await Promise.all([
      this.db.from('perfil').select('id, nombre, apellido, telefono, email').in('id', constructorIds),
      this.db.from('archivo')
        .select('id, nombre_archivo, url_storage, mime_type, tamano_bytes, tipo, oferta_id')
        .in('oferta_id', ofertaIds)
        .order('creado_en', { ascending: false }),
    ]);

    if (perfilesRes.error) throw new Error(`[perfiles] ${perfilesRes.error.message}`);
    if (archivosRes.error) throw new Error(`[archivos] ${archivosRes.error.message}`);

    const perfiles = perfilesRes.data ?? [];
    const archivos = archivosRes.data ?? [];
    console.debug('[OfertaService] constructorIds', constructorIds, 'perfiles', perfiles);

    return ofertas.map((o: any) => {
      const perfil          = perfiles.find((p: any) => String(p.id) === String(o.constructor_id));
      const archivosOferta  = archivos.filter((a: any) => String(a.oferta_id) === String(o.id));
      return {
        id:                o.id,
        precio:            o.precio,
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        garantia_anos:     o.garantia_anos ?? null,
        fecha_inicio:      o.fecha_inicio  ?? '',
        descripcion:       o.descripcion   ?? '',
        estado:            o.estado,
        constructor_nombre:   perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() || '—' : '—',
        constructor_telefono: perfil?.telefono ?? '—',
        constructor_email:    perfil?.email    ?? '—',
        documentos: archivosOferta.filter((a: any) => a.tipo === 'documento') as ArchivoRow[],
        videos:     archivosOferta.filter((a: any) => a.tipo === 'video')     as ArchivoRow[],
      } as OfertaConConstructor;
    });
  }

  async aceptarOferta(expedienteId: string, ofertaId: string): Promise<void> {
    const { error } = await this.db.rpc('aceptar_oferta', {
      p_expediente_id: expedienteId,
      p_oferta_id:     ofertaId,
    });
    if (error) throw new Error(error.message);
  }

  async getExpedienteIdsConOferta(constructorId: string): Promise<Set<string>> {
    const { data, error } = await this.db
      .from('oferta')
      .select('expediente_id')
      .eq('constructor_id', constructorId);

    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((o: any) => o.expediente_id));
  }

  async getOfertaPorExpediente(
    expedienteId: string,
    constructorId: string,
  ): Promise<(OfertaForm & { id: string }) | null> {
    const { data, error } = await this.db
      .from('oferta')
      .select('id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos, fecha_inicio, descripcion')
      .eq('expediente_id', expedienteId)
      .eq('constructor_id', constructorId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id:                data.id,
      precio:            data.precio,
      plazo_semanas_min: data.plazo_semanas_min,
      plazo_semanas_max: data.plazo_semanas_max,
      garantia_anos:     data.garantia_anos ?? null,
      fecha_inicio:      data.fecha_inicio  ?? '',
      descripcion:       data.descripcion   ?? '',
    };
  }

  async actualizar(
    ofertaId: string,
    constructorId: string,
    form: OfertaForm,
    documentoFile: File | null,
    videoFile: File | null,
  ): Promise<void> {
    const { error: updErr } = await this.db
      .from('oferta')
      .update({
        precio:            form.precio!,
        plazo_semanas_min: form.plazo_semanas_min,
        plazo_semanas_max: form.plazo_semanas_max,
        garantia_anos:     form.garantia_anos ?? null,
        fecha_inicio:      form.fecha_inicio  || null,
        descripcion:       form.descripcion,
      })
      .eq('id', ofertaId);

    if (updErr) throw new Error(updErr.message);

    const filesToReplace: Array<{ file: File; tipo: 'documento' | 'video' }> = [];
    if (documentoFile) filesToReplace.push({ file: documentoFile, tipo: 'documento' });
    if (videoFile)     filesToReplace.push({ file: videoFile,     tipo: 'video'     });

    for (const { file, tipo } of filesToReplace) {
      const { data: existing } = await this.db
        .from('archivo')
        .select('id, url_storage')
        .eq('oferta_id', ofertaId)
        .eq('tipo', tipo)
        .maybeSingle();

      if (existing) {
        await this.db.storage.from(BUCKET).remove([existing.url_storage]);
        await this.db.from('archivo').delete().eq('id', existing.id);
      }

      const path = `ofertas/${ofertaId}/${tipo}/${Date.now()}_${file.name}`;
      const { error: upErr } = await this.db.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: dbErr } = await this.db.from('archivo').insert({
        tipo,
        nombre_archivo: file.name,
        url_storage:    path,
        mime_type:      file.type || 'application/octet-stream',
        tamano_bytes:   file.size,
        subido_por:     constructorId,
        oferta_id:      ofertaId,
      });
      if (dbErr) {
        await this.db.storage.from(BUCKET).remove([path]);
        throw new Error(dbErr.message);
      }
    }
  }

  async getOferta(ofertaId: string): Promise<OfertaDetalle> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, expediente_id, precio, plazo_semanas_min, plazo_semanas_max, garantia_anos,
        fecha_inicio, descripcion, estado, creado_en,
        expediente:expediente_id (
          numero, fecha_visita,
          servicio:servicio_id ( nombre_es ),
          localizacion ( direccion, referencia, provincia, canton, distrito )
        )
      `)
      .eq('id', ofertaId)
      .single();

    if (error) throw new Error(error.message);

    const exp         = (data as any).expediente;
    const loc         = Array.isArray(exp?.localizacion) ? exp.localizacion[0] : exp?.localizacion;
    const expedienteId = (data as any).expediente_id ?? '';

    const { data: est } = await this.db
      .from('estimacion')
      .select('fecha_visita_real, descripcion_problemas, url_tour')
      .eq('expediente_id', expedienteId)
      .maybeSingle();

    return {
      id:                    data.id,
      expediente_id:         expedienteId,
      precio:                data.precio,
      plazo_semanas_min:     data.plazo_semanas_min,
      plazo_semanas_max:     data.plazo_semanas_max,
      garantia_anos:         data.garantia_anos     ?? null,
      fecha_inicio:          data.fecha_inicio      ?? '',
      descripcion:           data.descripcion       ?? '',
      estado:                data.estado,
      creado_en:             data.creado_en         ?? '',
      expediente_numero:     exp?.numero              ?? '—',
      servicio_nombre:       exp?.servicio?.nombre_es ?? '—',
      direccion:             loc?.direccion  ?? '—',
      referencia:            loc?.referencia ?? '',
      provincia:             loc?.provincia  ?? '—',
      canton:                loc?.canton     ?? '—',
      distrito:              loc?.distrito   ?? '—',
      fecha_visita:          exp?.fecha_visita               ?? '',
      fecha_visita_real:     est?.fecha_visita_real          ?? '',
      descripcion_problemas: est?.descripcion_problemas      ?? '',
      url_tour:              est?.url_tour                   ?? null,
    };
  }

  async getMisOfertasDashboard(constructorId: string): Promise<OfertaDashboard[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, precio, fecha_inicio, plazo_semanas_min, plazo_semanas_max, estado, creado_en,
        expediente:expediente_id (
          id, numero, estado,
          servicio:servicio_id ( nombre_es ),
          localizacion ( direccion, referencia, provincia, canton, distrito )
        )
      `)
      .eq('constructor_id', constructorId)
      .order('creado_en', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((o: any) => {
      const exp = o.expediente;
      const loc = Array.isArray(exp?.localizacion) ? exp.localizacion[0] : exp?.localizacion;
      return {
        id:                o.id,
        precio:            o.precio,
        fecha_inicio:      o.fecha_inicio      ?? '',
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        estado:            o.estado,
        creado_en:         o.creado_en         ?? '',
        expediente_id:     exp?.id             ?? '',
        expediente_numero: exp?.numero         ?? '—',
        expediente_estado: exp?.estado         ?? '',
        servicio_nombre:   exp?.servicio?.nombre_es ?? '—',
        direccion:         loc?.direccion  ?? '—',
        referencia:        loc?.referencia ?? '',
        provincia:         loc?.provincia  ?? '—',
        canton:            loc?.canton     ?? '—',
        distrito:          loc?.distrito   ?? '—',
      } as OfertaDashboard;
    });
  }

  async getMisOfertas(constructorId: string): Promise<OfertaRow[]> {
    const { data, error } = await this.db
      .from('oferta')
      .select(`
        id, precio, fecha_inicio, plazo_semanas_min, plazo_semanas_max, estado,
        expediente:expediente_id (
          numero,
          servicio:servicio_id ( nombre_es ),
          localizacion ( direccion, referencia, provincia, canton, distrito )
        )
      `)
      .eq('constructor_id', constructorId)
      .order('creado_en', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((o: any) => {
      const exp = o.expediente;
      const loc = Array.isArray(exp?.localizacion) ? exp.localizacion[0] : exp?.localizacion;
      return {
        id:                o.id,
        precio:            o.precio,
        fecha_inicio:      o.fecha_inicio      ?? '',
        plazo_semanas_min: o.plazo_semanas_min,
        plazo_semanas_max: o.plazo_semanas_max,
        estado:            o.estado,
        expediente_numero: exp?.numero              ?? '—',
        servicio_nombre:   exp?.servicio?.nombre_es ?? '—',
        direccion:         loc?.direccion  ?? '—',
        referencia:        loc?.referencia ?? '',
        provincia:         loc?.provincia  ?? '—',
        canton:            loc?.canton     ?? '—',
        distrito:          loc?.distrito   ?? '—',
      } as OfertaRow;
    });
  }

  async enviar(
    expedienteId: string,
    constructorId: string,
    form: OfertaForm,
    documentoFile: File | null,
    videoFile: File | null,
  ): Promise<void> {
    const { data: oferta, error: ofertaErr } = await this.db
      .from('oferta')
      .insert({
        expediente_id:     expedienteId,
        constructor_id:    constructorId,
        precio:            form.precio!,
        plazo_semanas_min: form.plazo_semanas_min,
        plazo_semanas_max: form.plazo_semanas_max,
        garantia_anos:     form.garantia_anos ?? null,
        fecha_inicio:      form.fecha_inicio  || null,
        descripcion:       form.descripcion,
        estado:            'pendiente',
      })
      .select('id')
      .single();

    if (ofertaErr) throw new Error(ofertaErr.message);
    const ofertaId = oferta.id as string;

    // Upload files into `archivo` with oferta_id (constraint: exactly one context FK)
    const filesToUpload: Array<{ file: File; tipo: 'documento' | 'video' }> = [];
    if (documentoFile) filesToUpload.push({ file: documentoFile, tipo: 'documento' });
    if (videoFile)     filesToUpload.push({ file: videoFile,     tipo: 'video'     });

    for (const { file, tipo } of filesToUpload) {
      const path = `ofertas/${ofertaId}/${tipo}/${Date.now()}_${file.name}`;

      const { error: upErr } = await this.db.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: dbErr } = await this.db.from('archivo').insert({
        tipo,
        nombre_archivo: file.name,
        url_storage:    path,
        mime_type:      file.type || 'application/octet-stream',
        tamano_bytes:   file.size,
        subido_por:     constructorId,
        oferta_id:      ofertaId,
      });
      if (dbErr) {
        await this.db.storage.from(BUCKET).remove([path]);
        throw new Error(dbErr.message);
      }
    }

    const { error: stateErr } = await this.db
      .from('expediente')
      .update({ estado: 'en_oferta' })
      .eq('id', expedienteId)
      .in('estado', ['estimado', 'en_oferta']);

    if (stateErr) throw new Error(stateErr.message);
  }
}
