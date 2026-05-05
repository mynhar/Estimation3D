import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from './auth-supabase.service';
import { OfertaForm, OfertaRow, BUCKET } from '../models';

@Injectable({ providedIn: 'root' })
export class OfertaService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

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
        precio:            form.precio,
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

    const { count: updCount, error: stateErr } = await this.db
      .from('expediente')
      .update({ estado: 'en_oferta' }, { count: 'exact' })
      .eq('id', expedienteId)
      .in('estado', ['estimado', 'en_oferta']);

    if (stateErr) throw new Error(stateErr.message);
    if (!updCount) throw new Error(
      'La oferta se guardó pero no se pudo actualizar el estado del expediente. ' +
      'Verifique la política RLS en la tabla expediente.'
    );
  }
}
