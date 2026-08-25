import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatterportHabitacion, MatterportModelo, MatterportPiso } from '../../../models/matterport.model';
import { matterportThumb } from '../../util/matterport';

/** Un piso con las habitaciones que le pertenecen, para pintarlo de una pasada. */
interface PisoConHabitaciones {
  piso:         MatterportPiso | null;
  habitaciones: MatterportHabitacion[];
}

/** Modelo listo para la plantilla: la fila más su portada y su agrupación. */
interface ModeloVM {
  modelo:   MatterportModelo;
  portada:  string | null;
  ubicacion: string | null;
  plantas:  PisoConHabitaciones[];
}

/**
 * Ficha de la propiedad escaneada (Matterport) de un expediente.
 *
 * Solo muestra: los datos los sincroniza la edge function `matterport-sync`.
 * El botón de sincronizar se activa con `puedeSincronizar` — lo encienden las
 * pantallas del estimador y del administrador; el cliente y el constructor ven
 * la ficha en modo lectura.
 */
@Component({
  selector: 'app-matterport-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './matterport-info.component.html',
  styleUrl:    './matterport-info.component.css',
})
export class MatterportInfoComponent {
  /** Fichas del expediente, una por tour. */
  modelos = input.required<MatterportModelo[]>();
  /** Muestra el botón de sincronizar (estimador / administrador). */
  puedeSincronizar = input(false);
  /** Sincronización en curso: el botón pasa a estado `loading`. */
  sincronizando = input(false);
  /** Clave i18n del error de la última sincronización, o cadena vacía. */
  errorClave = input('');
  /** Clave i18n del acuse de la última sincronización, o cadena vacía. */
  exitoClave = input('');

  sincronizar = output<void>();

  private translate = inject(TranslateService);

  currentLang = toSignal(
    this.translate.onLangChange.pipe(map(e => e.lang)),
    { initialValue: this.translate.currentLang },
  );

  /** Modelos con las habitaciones ya repartidas por planta. */
  vistas = computed<ModeloVM[]>(() => this.modelos().map(m => ({
    modelo:    m,
    // `imagen_url` de la API puede caducar; la miniatura pública del player no.
    portada:   m.imagen_url ?? matterportThumb(m.url_tour),
    ubicacion: this.componerUbicacion(m),
    plantas:   this.agruparPorPiso(m),
  })));

  /** Fecha de la última sincronización (todas las fichas se guardan juntas). */
  sincronizadoEn = computed(() => this.modelos()[0]?.sincronizado_en ?? null);

  /** Ids de los modelos cuyo detalle de habitaciones está desplegado. */
  private desplegados = signal<ReadonlySet<string>>(new Set());

  estaDesplegado(id: string): boolean {
    return this.desplegados().has(id);
  }

  alternarDetalle(id: string): void {
    const siguiente = new Set(this.desplegados());
    if (!siguiente.delete(id)) siguiente.add(id);
    this.desplegados.set(siguiente);
  }

  // ── Formato ────────────────────────────────────────────────────────────────

  private get locale(): string {
    const mapa: Record<string, string> = { es: 'es-CA', en: 'en-CA', fr: 'fr-CA' };
    return mapa[this.currentLang()] ?? 'fr-CA';
  }

  /** Número con separador de miles y un decimal como mucho. */
  numero(valor: number | null | undefined, decimales = 1): string | null {
    if (valor == null || !isFinite(valor)) return null;
    return valor.toLocaleString(this.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    });
  }

  /** Superficie en m², o null si Matterport no la calculó. */
  area(valor: number | null | undefined): string | null {
    const n = this.numero(valor);
    return n === null ? null : `${n} m²`;
  }

  /** Superficie en pie², el formato con el que cotiza el mercado canadiense. */
  areaPies(valor: number | null | undefined): string | null {
    const n = this.numero(valor, 0);
    return n === null ? null : `${n} pi²`;
  }

  volumen(valor: number | null | undefined): string | null {
    const n = this.numero(valor);
    return n === null ? null : `${n} m³`;
  }

  /** Alto × ancho × profundidad, con los valores que haya. */
  medidas(d: MatterportDimensionable): string | null {
    const partes = [d.ancho_m, d.profundidad_m, d.alto_m]
      .map(v => this.numero(v))
      .filter((v): v is string => v !== null);
    return partes.length ? `${partes.join(' × ')} m` : null;
  }

  fecha(valor: string | null | undefined): string | null {
    if (!valor) return null;
    const d = new Date(valor);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(this.locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /**
   * Etiqueta de una habitación: la que puso el usuario en Matterport y, si no
   * hay, el primer clasificador automático traducido.
   */
  etiquetaHabitacion(h: MatterportHabitacion): string {
    if (h.etiqueta) return h.etiqueta;
    const tag = h.tags[0];
    return tag ? this.etiquetaTag(tag) : this.translate.instant('matterport.room_untitled');
  }

  /** Traduce un clasificador de Matterport; si no está en el catálogo, lo deja crudo. */
  etiquetaTag(tag: string): string {
    const clave = `matterport.tags.${tag}`;
    const texto = this.translate.instant(clave);
    return texto === clave ? tag.replace(/_/g, ' ') : texto;
  }

  /** Etiqueta de una planta: la de Matterport o su número de orden. */
  etiquetaPiso(piso: MatterportPiso | null): string {
    if (piso?.etiqueta) return piso.etiqueta;
    const n = (piso?.secuencia ?? 0) + 1;
    return this.translate.instant('matterport.floor_n', { n });
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  /** Dirección de Matterport en una línea, sin repetir lo que ya trae `direccion`. */
  private componerUbicacion(m: MatterportModelo): string | null {
    if (m.direccion) return m.direccion;
    const partes = [m.calle, m.ciudad, m.region, m.codigo_postal, m.pais]
      .filter((p): p is string => !!p);
    return partes.length ? partes.join(', ') : null;
  }

  /**
   * Reparte las habitaciones entre sus pisos. Las que Matterport no asocia a
   * ninguno caen en un grupo sin planta al final, para no perderlas.
   */
  private agruparPorPiso(m: MatterportModelo): PisoConHabitaciones[] {
    const porPiso = new Map<string, MatterportHabitacion[]>();
    const sueltas: MatterportHabitacion[] = [];

    for (const h of m.habitaciones) {
      if (!h.piso_id) { sueltas.push(h); continue; }
      const lista = porPiso.get(h.piso_id);
      if (lista) lista.push(h);
      else porPiso.set(h.piso_id, [h]);
    }

    const grupos: PisoConHabitaciones[] = m.pisos.map(piso => ({
      piso,
      habitaciones: porPiso.get(piso.id) ?? [],
    }));
    if (sueltas.length) grupos.push({ piso: null, habitaciones: sueltas });
    return grupos;
  }
}

/** Cualquier cosa con las tres medidas lineales (un modelo, un piso, una sala). */
type MatterportDimensionable = Pick<MatterportPiso, 'alto_m' | 'ancho_m' | 'profundidad_m'>;
