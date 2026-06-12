import { Injectable, inject } from '@angular/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

export interface DashboardStats {
  expedientes:  { total: number; porEstado: Record<string, number> };
  estimaciones: { total: number; promedioMin: number | null; promedioMax: number | null };
  ofertas:      { total: number; porEstado: Record<string, number>; constructoresActivos: number };
  contratos:    { total: number; porEstado: Record<string, number>; valorTotal: number };
  obras:        { total: number; porEstado: Record<string, number>; avanceMedio: number };
}

export interface TimelineEvent {
  id:         string;
  timestamp:  string;
  tipo:       'expediente' | 'estimacion' | 'oferta' | 'contrato' | 'obra';
  descKey:    string;
  precio?:    string;
  autor:      string;
  referencia: string;
  entityId?:  string;
  avance?:    number;   // % de avance de la obra (eventos tipo 'obra')
  estadoObra?: string;  // estado del seguimiento (eventos tipo 'obra')
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private auth = inject(AuthSupabaseService);
  private get db() { return this.auth.client; }

  async getStats(): Promise<DashboardStats> {
    const [expsR, estsR, ofersR, ctrsR, obrasR] = await Promise.all([
      this.db.from('expediente').select('estado'),
      this.db.from('estimacion').select('costo_estimado, costo_estimado_max'),
      this.db.from('oferta').select('estado, constructor_id'),
      this.db.from('contrato').select('estado, precio_final'),
      this.db.from('seguimiento_obra').select('estado, porcentaje_avance'),
    ]);

    // ── Expedientes ───────────────────────────────────────────────────────────
    const exps = expsR.data ?? [];
    const expsPorEstado: Record<string, number> = {};
    for (const e of exps) {
      expsPorEstado[e.estado as string] = (expsPorEstado[e.estado as string] ?? 0) + 1;
    }

    // ── Estimaciones ──────────────────────────────────────────────────────────
    const ests   = estsR.data ?? [];
    const mins   = ests.map(e => e.costo_estimado).filter((v): v is number => v !== null);
    const maxs   = ests.map(e => e.costo_estimado_max).filter((v): v is number => v !== null);
    const promedioMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null;
    const promedioMax = maxs.length ? maxs.reduce((a, b) => a + b, 0) / maxs.length : null;

    // ── Ofertas ───────────────────────────────────────────────────────────────
    const ofers = ofersR.data ?? [];
    const ofersPorEstado: Record<string, number> = {};
    const constructores = new Set<string>();
    for (const o of ofers) {
      ofersPorEstado[o.estado as string] = (ofersPorEstado[o.estado as string] ?? 0) + 1;
      constructores.add(o.constructor_id);
    }

    // ── Contratos ─────────────────────────────────────────────────────────────
    const ctrs = ctrsR.data ?? [];
    const ctrsPorEstado: Record<string, number> = {};
    let valorTotal = 0;
    for (const c of ctrs) {
      ctrsPorEstado[c.estado as string] = (ctrsPorEstado[c.estado as string] ?? 0) + 1;
      if ((c.estado as string) !== 'cancelado') valorTotal += (c.precio_final ?? 0);
    }

    // ── Obras (seguimiento) ───────────────────────────────────────────────────
    const obras = obrasR.data ?? [];
    const obrasPorEstado: Record<string, number> = {};
    let avanceSum = 0;
    for (const o of obras) {
      obrasPorEstado[o.estado as string] = (obrasPorEstado[o.estado as string] ?? 0) + 1;
      avanceSum += (o.porcentaje_avance as number) ?? 0;
    }
    const avanceMedio = obras.length ? Math.round(avanceSum / obras.length) : 0;

    return {
      expedientes:  { total: exps.length,  porEstado: expsPorEstado },
      estimaciones: { total: ests.length,  promedioMin, promedioMax },
      ofertas:      { total: ofers.length, porEstado: ofersPorEstado, constructoresActivos: constructores.size },
      contratos:    { total: ctrs.length,  porEstado: ctrsPorEstado, valorTotal },
      obras:        { total: obras.length, porEstado: obrasPorEstado, avanceMedio },
    };
  }

  async getTimeline(): Promise<TimelineEvent[]> {
    const [expsR, estsR, ofersR, ctrsR, repsR] = await Promise.all([
      this.db
        .from('expediente')
        .select('id, numero, creado_en, cliente:cliente_id(nombre, apellido)')
        .order('creado_en', { ascending: false })
        .limit(25),
      this.db
        .from('estimacion')
        .select('id, creado_en, expediente:expediente_id(numero), estimador:estimador_id(nombre, apellido)')
        .order('creado_en', { ascending: false })
        .limit(25),
      this.db
        .from('oferta')
        .select('id, precio, creado_en, expediente:expediente_id(numero), constructor:constructor_id(nombre, apellido)')
        .order('creado_en', { ascending: false })
        .limit(25),
      this.db
        .from('contrato')
        .select('id, estado, generado_en, firmado_en, expediente:expediente_id(numero), cliente:cliente_id(nombre, apellido)')
        .order('generado_en', { ascending: false })
        .limit(25),
      this.db
        .from('reporte_diario')
        .select('id, creado_en, porcentaje_acumulado, constructor:constructor_id(nombre, apellido), seguimiento:seguimiento_id(estado, expediente:expediente_id(numero))')
        .order('creado_en', { ascending: false })
        .limit(25),
    ]);

    const events: TimelineEvent[] = [];
    const fmtPrecio = (v: number) =>
      new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
    const nombre = (p: any) => (p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || '—' : '—');

    for (const e of (expsR.data ?? []) as any[]) {
      events.push({
        id: `exp-${e.id}`, timestamp: e.creado_en, tipo: 'expediente',
        descKey: 'admin_dashboard.tl_event_exp_created',
        autor: nombre(e.cliente), referencia: e.numero,
        entityId: e.id,
      });
    }

    for (const e of (estsR.data ?? []) as any[]) {
      events.push({
        id: `est-${e.id}`, timestamp: e.creado_en, tipo: 'estimacion',
        descKey: 'admin_dashboard.tl_event_est_created',
        autor: nombre(e.estimador), referencia: e.expediente?.numero ?? '—',
      });
    }

    for (const o of (ofersR.data ?? []) as any[]) {
      events.push({
        id: `ofe-${o.id}`, timestamp: o.creado_en, tipo: 'oferta',
        descKey: 'admin_dashboard.tl_event_ofe_sent',
        precio: fmtPrecio(o.precio ?? 0),
        autor: nombre(o.constructor), referencia: o.expediente?.numero ?? '—',
      });
    }

    for (const c of (ctrsR.data ?? []) as any[]) {
      const autor = nombre(c.cliente);
      const ref   = c.expediente?.numero ?? '—';
      events.push({
        id: `ctr-gen-${c.id}`, timestamp: c.generado_en, tipo: 'contrato',
        descKey: 'admin_dashboard.tl_event_ctr_generated', autor, referencia: ref,
      });
      if (c.firmado_en) {
        events.push({
          id: `ctr-firm-${c.id}`, timestamp: c.firmado_en, tipo: 'contrato',
          descKey: 'admin_dashboard.tl_event_ctr_signed', autor, referencia: ref,
        });
      }
    }

    for (const r of (repsR.data ?? []) as any[]) {
      const seg = Array.isArray(r.seguimiento) ? r.seguimiento[0] : r.seguimiento;
      const exp = seg ? (Array.isArray(seg.expediente) ? seg.expediente[0] : seg.expediente) : null;
      events.push({
        id: `rep-${r.id}`, timestamp: r.creado_en, tipo: 'obra',
        descKey: 'admin_dashboard.tl_event_obra_report',
        autor: nombre(r.constructor), referencia: exp?.numero ?? '—',
        avance: Math.round(r.porcentaje_acumulado ?? 0),
        estadoObra: seg?.estado ?? undefined,
      });
    }

    return events.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}
