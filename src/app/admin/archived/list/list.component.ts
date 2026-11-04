import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedienteService } from '../../../services/expediente.service';
import { ExpedienteArchivadoAdmin } from '../../../models';

type VistaArchivados = 'tabla' | 'tarjetas';

/** Insignia del estado que tenía el expediente al archivarse. */
const BADGE_ESTADO: Record<string, string> = {
  nuevo:         'badge-nuevo',
  en_estimacion: 'badge-en_estimacion',
  estimado:      'badge-estimado',
  en_oferta:     'badge-en_oferta',
  adjudicado:    'badge-adjudicado',
  contratado:    'badge-contratado',
  cancelado:     'badge-cancelado',
};

/** Minúsculas y sin acentos, para que «Montreal» encuentre «Montréal». */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * admin/archived — expedientes archivados.
 *
 * Los archivados no salen en Expedientes, Estimaciones, Ofertas, Contratos ni
 * Seguimiento de obra: esta es la única lista donde aparecen, y solo la ve el
 * administrador, el único que puede modificarlos. Cada fila abre
 * admin/file/edit. Son pocos, así que se cargan todos y se filtran aquí.
 * Vista de tarjetas por defecto; en escritorio se puede pasar a tabla (en
 * móvil siempre tarjetas), como en admin/file.
 */
@Component({
  selector: 'app-admin-archived-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class AdminArchivedListComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  private todos = signal<ExpedienteArchivadoAdmin[]>([]);
  cargando      = signal(true);
  error         = signal<string | null>(null);
  busqueda      = signal('');
  vista         = signal<VistaArchivados>('tarjetas');

  /** Ids cuya miniatura falló al cargar → se pinta el marcador de posición. */
  private fotosFallidas = signal<ReadonlySet<string>>(new Set<string>());

  total = computed(() => this.todos().length);

  /** Cada término de la búsqueda debe aparecer en algún campo. */
  expedientes = computed(() => {
    const terminos = normalizar(this.busqueda()).split(/\s+/).filter(Boolean);
    if (!terminos.length) return this.todos();
    return this.todos().filter(e => {
      const texto = normalizar([
        e.numero, e.cliente_nombre,
        e.servicio_nombre, e.servicio_nombre_en, e.servicio_nombre_fr,
        e.direccion, e.canton, e.distrito, e.provincia,
      ].join(' '));
      return terminos.every(t => texto.includes(t));
    });
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.todos.set(await this.expedienteService.getExpedientesArchivadosAdmin());
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.cargando.set(false);
    }
  }

  setBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  limpiarBusqueda(): void {
    this.busqueda.set('');
  }

  setVista(v: VistaArchivados): void {
    this.vista.set(v);
  }

  fotoExpediente(e: ExpedienteArchivadoAdmin): string | null {
    return this.fotosFallidas().has(e.id) ? null : e.foto;
  }

  onFotoError(id: string): void {
    this.fotosFallidas.update(actual => new Set(actual).add(id));
  }

  abrir(id: string): void {
    this.router.navigate(['/admin/file/edit', id]);
  }

  servicioNombre(e: ExpedienteArchivadoAdmin): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return e.servicio_nombre_en || e.servicio_nombre;
    if (lang === 'fr') return e.servicio_nombre_fr || e.servicio_nombre;
    return e.servicio_nombre;
  }

  /** Ciudad y código postal (`canton` y `distrito` en la tabla). */
  lugar(e: ExpedienteArchivadoAdmin): string {
    return [e.canton, e.distrito].filter(Boolean).join(' · ');
  }

  badgeEstado(estado: string | null): string {
    return BADGE_ESTADO[estado ?? ''] ?? 'badge-cancelado';
  }

  /** `archivado_en` es un instante: se muestra en la fecha local. */
  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
}
