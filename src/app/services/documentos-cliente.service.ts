import { Injectable, inject } from '@angular/core';
import { ArchivoService } from './archivo.service';
import { ExpedienteService } from './expediente.service';
import { SeguimientoService } from './seguimiento.service';
import {
  PerfilRepository,
  EstimacionRepository,
  OfertaRepository,
  ContratoRepository,
} from '../data';
import { ArchivoRow } from '../models';

export type TipoArchivo = 'foto' | 'video' | 'documento';
export type RolSubida   = 'cliente' | 'estimador' | 'constructor' | 'administrador' | 'desconocido';
export type FuenteArchivo = 'expediente' | 'estimacion' | 'oferta' | 'contrato' | 'reporte';

const ORDEN_ROLES: RolSubida[] = ['cliente', 'estimador', 'constructor', 'administrador', 'desconocido'];

// Un archivo de cualquier fuente del ciclo del expediente, con tipo, origen y
// autor ya resueltos, y una URL lista para abrir.
export interface ArchivoVM {
  id:              string;
  archivoId?:      string;          // id real de la fila `archivo` (para borrar); undefined si no aplica
  nombre:          string;
  tipo:            TipoArchivo;
  fuente:          FuenteArchivo;
  url:             string;          // URL lista para abrir (pública, firmada o externa)
  urlStorage:      string;          // ruta en bucket 'archivos' (solo para borrar; '' si no aplica)
  esExterno:       boolean;         // enlace externo (tour 3D) → sin descarga ni borrado
  mimeType:        string;
  tamanoBytes:     number;
  subidoPor:       string | null;
  subidoPorNombre: string;
  subidoPorRol:    RolSubida;
  esPropio:        boolean;         // archivo propio en storage → borrable por RLS
}

export interface GrupoRolVM {
  rol:      RolSubida;
  archivos: ArchivoVM[];
}

export interface ExpedienteArchivosVM {
  expedienteId: string;
  numero:       string;
  estado:       string;
  total:        number;
  conteo:       { foto: number; video: number; documento: number };
  grupos:       GrupoRolVM[];
}

@Injectable({ providedIn: 'root' })
export class DocumentosClienteService {
  private expedienteService  = inject(ExpedienteService);
  private archivoService     = inject(ArchivoService);
  private seguimientoService = inject(SeguimientoService);
  private perfilRepo         = inject(PerfilRepository);
  private estimacionRepo     = inject(EstimacionRepository);
  private ofertaRepo         = inject(OfertaRepository);
  private contratoRepo       = inject(ContratoRepository);

  async getExpedientesConArchivos(clienteId: string): Promise<ExpedienteArchivosVM[]> {
    const expedientes = await this.expedienteService.getMisExpedientes(clienteId);
    if (!expedientes.length) return [];

    const crudos = await Promise.all(
      expedientes.map(e => this.recolectar(e.id, e.numero)),
    );

    // Resolver nombre + rol de todos los autores en una sola consulta.
    const autorIds = [...new Set(crudos.flatMap(c => c.autorIds))];
    const perfiles = await this.perfilRepo.findNombreRolByIds(autorIds);
    const perfilPorId = new Map(perfiles.map(p => [p.id, p]));
    const nombreDe = (id: string | null): string => {
      const p = id ? perfilPorId.get(id) : null;
      return p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || '—' : '—';
    };

    // Rol autoritativo: el del perfil del autor si se conoce; si no, el
    // provisional asignado por la fuente (p. ej. contrato → administrador).
    const rolDe = (it: { subidoPor: string | null; subidoPorRol: RolSubida }): RolSubida => {
      if (it.subidoPor) {
        const p = perfilPorId.get(it.subidoPor);
        if (p?.rol) return p.rol as RolSubida;
      }
      return it.subidoPorRol;
    };

    return expedientes.map((e, i) => {
      const { items } = crudos[i];
      const vms: ArchivoVM[] = items.map(it => ({
        ...it,
        subidoPorNombre: it.subidoPorNombre ?? nombreDe(it.subidoPor),
        subidoPorRol:    rolDe(it),
        esPropio:        it.fuente === 'expediente' && !!it.subidoPor && it.subidoPor === clienteId,
      }));

      const grupos: GrupoRolVM[] = ORDEN_ROLES
        .map(rol => ({ rol, archivos: vms.filter(v => v.subidoPorRol === rol) }))
        .filter(g => g.archivos.length > 0);

      return {
        expedienteId: e.id,
        numero:       e.numero,
        estado:       e.estado,
        total:        vms.length,
        conteo: {
          foto:      vms.filter(v => v.tipo === 'foto').length,
          video:     vms.filter(v => v.tipo === 'video').length,
          documento: vms.filter(v => v.tipo === 'documento').length,
        },
        grupos,
      };
    });
  }

  /**
   * Archivos de UN expediente (todas las fuentes y roles), con autor/rol
   * resueltos. Misma data que `getExpedientesConArchivos` pero acotada a un
   * expediente — para el módulo "Mis documentos" del dashboard del cliente.
   */
  async getArchivosDeExpediente(
    expedienteId: string,
    numero: string,
    clienteId: string,
  ): Promise<ArchivoVM[]> {
    const { items, autorIds } = await this.recolectar(expedienteId, numero);
    const perfiles    = await this.perfilRepo.findNombreRolByIds(autorIds);
    const perfilPorId = new Map(perfiles.map(p => [p.id, p]));
    const nombreDe = (id: string | null): string => {
      const p = id ? perfilPorId.get(id) : null;
      return p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || '—' : '—';
    };
    const rolDe = (it: { subidoPor: string | null; subidoPorRol: RolSubida }): RolSubida => {
      if (it.subidoPor) {
        const p = perfilPorId.get(it.subidoPor);
        if (p?.rol) return p.rol as RolSubida;
      }
      return it.subidoPorRol;
    };
    return items.map(it => ({
      ...it,
      subidoPorNombre: it.subidoPorNombre ?? nombreDe(it.subidoPor),
      subidoPorRol:    rolDe(it),
      esPropio:        it.fuente === 'expediente' && !!it.subidoPor && it.subidoPor === clienteId,
    }));
  }

  // ── Recolección por expediente (todas las fuentes) ──────────────────────────
  // Devuelve items parciales (sin nombre resuelto) + los ids de autor a resolver.
  private async recolectar(expedienteId: string, numero: string): Promise<{
    items: (Omit<ArchivoVM, 'subidoPorNombre'> & { subidoPorNombre?: string })[];
    autorIds: string[];
  }> {
    const [archExp, estim, ofertas, contrato] = await Promise.all([
      this.archivoService.cargarTodos(expedienteId),
      this.estimacionRepo.findByExpedienteId(expedienteId),
      this.ofertaRepo.findByExpedienteId(expedienteId),
      this.contratoRepo.findForClientByExpedienteId(expedienteId),
    ]);

    const items: (Omit<ArchivoVM, 'subidoPorNombre'> & { subidoPorNombre?: string })[] = [];
    const autorIds = new Set<string>();

    // A. Archivos subidos directamente al expediente (cliente / estimador).
    const mapExp = (rows: ArchivoRow[], tipo: TipoArchivo) => {
      for (const a of rows) {
        if (a.subido_por) autorIds.add(a.subido_por);
        items.push({
          id:           `exp:${a.id}`,
          archivoId:    a.id,
          nombre:       a.nombre_archivo,
          tipo,
          fuente:       'expediente',
          url:          this.archivoService.publicUrl(a.url_storage),
          urlStorage:   a.url_storage,
          esExterno:    false,
          mimeType:     a.mime_type,
          tamanoBytes:  a.tamano_bytes,
          subidoPor:    a.subido_por ?? null,
          subidoPorRol: 'desconocido',     // se ajusta tras resolver perfil
          esPropio:     false,             // se ajusta abajo
        });
      }
    };
    mapExp(archExp.fotos, 'foto');
    mapExp(archExp.videos, 'video');
    mapExp(archExp.documentos, 'documento');

    // B. Videos 3D del estimador (estimacion.url_tour → enlaces externos).
    const tours = this.parseUrls(estim?.url_tour ?? null);
    if (estim?.estimador_id) autorIds.add(estim.estimador_id);
    tours.forEach((url, idx) => {
      items.push({
        id:              `tour:${expedienteId}:${idx}`,
        nombre:          `Tour 3D ${idx + 1}`,
        tipo:            'video',
        fuente:          'estimacion',
        url,
        urlStorage:      '',
        esExterno:       true,
        mimeType:        '',
        tamanoBytes:     0,
        subidoPor:       estim?.estimador_id ?? null,
        subidoPorRol:    'estimador',
        esPropio:        false,
      });
    });

    // C. Archivos de las ofertas (constructor).
    const ofertasArch = await Promise.all(
      ofertas.map(async o => ({ o, arch: await this.archivoService.cargarPorOferta(o.id) })),
    );
    for (const { o, arch } of ofertasArch) {
      if (o.constructor_id) autorIds.add(o.constructor_id);
      const push = (rows: ArchivoRow[], tipo: TipoArchivo) => {
        for (const a of rows) {
          items.push({
            id:           `ofe:${a.id}`,
            archivoId:    a.id,
            nombre:       a.nombre_archivo,
            tipo,
            fuente:       'oferta',
            url:          this.archivoService.publicUrl(a.url_storage),
            urlStorage:   a.url_storage,
            esExterno:    false,
            mimeType:     a.mime_type,
            tamanoBytes:  a.tamano_bytes,
            subidoPor:    o.constructor_id ?? null,
            subidoPorRol: 'constructor',
            esPropio:     false,
          });
        }
      };
      push(arch.documentos, 'documento');
      push(arch.videos, 'video');
    }

    // D. Contrato (PDF firmado en bucket 'contratos').
    if (contrato?.url_pdf) {
      try {
        const url = await this.contratoRepo.getSignedUrl(contrato.url_pdf);
        items.push({
          id:              `ctr:${contrato.id}`,
          nombre:          `Contrato ${numero}.pdf`,
          tipo:            'documento',
          fuente:          'contrato',
          url,
          urlStorage:      '',
          esExterno:       true,            // bucket distinto: sin borrado vía 'archivos'
          mimeType:        'application/pdf',
          tamanoBytes:     0,
          subidoPor:       null,
          subidoPorNombre: 'Estimation3D',
          subidoPorRol:    'administrador',
          esPropio:        false,
        });
      } catch { /* sin acceso al PDF firmado: se omite */ }
    }

    // E. Seguimiento de obra: media de los partes (constructor).
    if (contrato?.id) {
      const seg = await this.seguimientoService.getSeguimientoByContratoId(contrato.id);
      if (seg) {
        const reportes = await this.seguimientoService.getReportesBySeguimientoIds([seg.id]);
        if (reportes.length) {
          const media = await this.archivoService.cargarPorReportes(reportes.map(r => r.id));
          for (const bucket of media.values()) {
            const push = (rows: { id: string; nombre_archivo: string; url_storage: string; mime_type: string; tamano_bytes: number; subido_por?: string }[], tipo: TipoArchivo) => {
              for (const a of rows) {
                if (a.subido_por) autorIds.add(a.subido_por);
                items.push({
                  id:           `rep:${a.id}`,
                  archivoId:    a.id,
                  nombre:       a.nombre_archivo,
                  tipo,
                  fuente:       'reporte',
                  url:          this.archivoService.publicUrl(a.url_storage),
                  urlStorage:   a.url_storage,
                  esExterno:    false,
                  mimeType:     a.mime_type,
                  tamanoBytes:  a.tamano_bytes,
                  subidoPor:    a.subido_por ?? null,
                  subidoPorRol: 'constructor',
                  esPropio:     false,
                });
              }
            };
            push(bucket.fotos, 'foto');
            push(bucket.videos, 'video');
            push(bucket.documentos, 'documento');
          }
        }
      }
    }

    return { items, autorIds: [...autorIds] };
  }

  // url_tour es un JSON array de URLs o una sola URL.
  private parseUrls(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string' && !!u);
    } catch { /* no es JSON: una sola URL */ }
    return [raw];
  }
}
