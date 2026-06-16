import { Injectable, inject } from '@angular/core';
import { SeguimientoService } from './seguimiento.service';
import {
  ExpedienteRepository,
  EstimacionRepository,
  OfertaRepository,
  ContratoRepository,
  PerfilRepository,
} from '../data';

export type CategoriaEvento = 'expediente' | 'oferta' | 'contrato' | 'obra';

// Un evento de la cronología, con fecha real tomada de los timestamps del
// proceso (no hay tabla de auditoría: se reconstruye desde las entidades).
export interface EventoHistorialVM {
  id:        string;
  fecha:     string;            // fecha/timestamp crudo para mostrar
  ts:        number;            // clave de orden (epoch ms)
  categoria: CategoriaEvento;
  titulo:    string;            // clave i18n
  detalle:   string | null;
  icono:     string;
}

export interface ExpedienteHistorialVM {
  expedienteId: string;
  numero:       string;
  estado:       string;
  eventos:      EventoHistorialVM[];
}

@Injectable({ providedIn: 'root' })
export class HistorialClienteService {
  private expedienteRepo  = inject(ExpedienteRepository);
  private estimacionRepo  = inject(EstimacionRepository);
  private ofertaRepo      = inject(OfertaRepository);
  private contratoRepo    = inject(ContratoRepository);
  private perfilRepo      = inject(PerfilRepository);
  private seguimientoSvc  = inject(SeguimientoService);

  async getHistorial(clienteId: string): Promise<ExpedienteHistorialVM[]> {
    const exps = await this.expedienteRepo.findHistorialByClienteId(clienteId);
    if (!exps.length) return [];

    const expIds = exps.map(e => e.id);

    const [estimaciones, ofertas, contratos] = await Promise.all([
      this.estimacionRepo.findSummaryByExpedienteIds(expIds),
      this.ofertaRepo.findByExpedienteIds(expIds),
      this.contratoRepo.findHistorialByClienteId(clienteId),
    ]);

    const seguimientos = await this.seguimientoSvc.getSeguimientosByContratoIds(contratos.map(c => c.id));
    const reportes     = await this.seguimientoSvc.getReportesBySeguimientoIds(seguimientos.map(s => s.id));

    // Nombres de constructores (para las ofertas).
    const constructorIds = [...new Set(ofertas.map(o => o.constructor_id).filter(Boolean))];
    const perfiles = await this.perfilRepo.findByIds(constructorIds);
    const nombrePorId = new Map(perfiles.map(p => [p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || '—']));

    // Índices por expediente.
    const visitaRealPorExp = new Map(estimaciones.map(e => [e.expediente_id, e.fecha_visita_real]));
    const ofertasPorExp    = this.agrupar(ofertas, o => o.expediente_id);
    const contratoPorExp   = new Map(contratos.map(c => [c.expediente_id, c]));
    const seguimientoPorExp = new Map(seguimientos.map(s => [s.expediente_id, s]));
    const segIdToExp       = new Map(seguimientos.map(s => [s.id, s.expediente_id]));
    const reportesPorExp   = this.agrupar(reportes, r => segIdToExp.get(r.seguimiento_id) ?? '');

    const fmtPrecio = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

    return exps.map(e => {
      const eventos: EventoHistorialVM[] = [];
      const push = (
        fecha: string | null, categoria: CategoriaEvento, titulo: string,
        detalle: string | null, icono: string, sufijo: string,
      ) => {
        if (!fecha) return;
        const ts = Date.parse(fecha);
        eventos.push({
          id: `${e.id}:${sufijo}`,
          fecha,
          ts: isNaN(ts) ? 0 : ts,
          categoria, titulo, detalle, icono,
        });
      };

      // ── Expediente ──
      push(e.creado_en, 'expediente', 'history.exp_creado', null, 'bi-folder-plus', 'exp_creado');
      push(e.fecha_visita, 'expediente', 'history.visita_programada', null, 'bi-calendar-event', 'visita_prog');
      push(visitaRealPorExp.get(e.id) ?? null, 'expediente', 'history.visita_realizada', null, 'bi-clipboard-check', 'visita_real');
      if (e.estado === 'cancelado') {
        push(e.actualizado_en, 'expediente', 'history.exp_cancelado', null, 'bi-x-circle', 'exp_cancel');
      }

      // ── Ofertas ──
      for (const o of ofertasPorExp.get(e.id) ?? []) {
        const detalle = `${nombrePorId.get(o.constructor_id) ?? '—'} · ${fmtPrecio.format(o.precio)}`;
        push(o.creado_en, 'oferta', 'history.oferta_recibida', detalle, 'bi-cash-coin', `oferta_${o.id}`);
      }

      // ── Contrato ──
      const c = contratoPorExp.get(e.id);
      if (c) {
        push(c.generado_en, 'contrato', 'history.contrato_generado', null, 'bi-file-earmark-text', 'ctr_gen');
        push(c.firmado_en, 'contrato', 'history.contrato_firmado', null, 'bi-pen', 'ctr_firma');
        if (c.estado === 'cancelado') {
          push(c.actualizado_en, 'contrato', 'history.contrato_cancelado', null, 'bi-x-circle', 'ctr_cancel');
        }
      }

      // ── Seguimiento de obra ──
      const s = seguimientoPorExp.get(e.id);
      if (s) {
        push(s.fecha_inicio_real, 'obra', 'history.obra_iniciada', null, 'bi-play-circle', 'obra_ini');
        for (const r of reportesPorExp.get(e.id) ?? []) {
          const pct = r.porcentaje_acumulado ?? r.porcentaje_avance_dia;
          const detalle = pct != null ? `${Math.round(pct)} %` : null;
          push(r.fecha, 'obra', 'history.parte_obra', detalle, 'bi-clipboard-data', `parte_${r.id}`);
        }
        push(s.fecha_fin_real, 'obra', 'history.obra_finalizada', null, 'bi-flag', 'obra_fin');
      }

      eventos.sort((a, b) => b.ts - a.ts);

      return { expedienteId: e.id, numero: e.numero, estado: e.estado, eventos };
    });
  }

  private agrupar<T>(items: T[], clave: (it: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const it of items) {
      const k = clave(it);
      if (!k) continue;
      const arr = map.get(k);
      arr ? arr.push(it) : map.set(k, [it]);
    }
    return map;
  }
}
